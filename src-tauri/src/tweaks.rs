//! Catálogo de tweaks (tweaks.json) y generación de los scripts de comprobar / aplicar / revertir.
//!
//! El frontend solo envía IDs: los scripts viven aquí, en el binario.

use crate::ps::{self, q};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::OnceLock;

#[derive(Deserialize, Clone)]
pub struct RegEntry {
    pub path: String,
    pub name: String,
    pub value: Value,
    #[serde(rename = "type", default = "dword")]
    pub kind: String,
    /// Valor original. Si falta, al revertir se borra el valor (comportamiento por defecto de Windows).
    #[serde(default)]
    pub default: Option<Value>,
}

fn dword() -> String {
    "DWord".into()
}

#[derive(Deserialize, Clone)]
pub struct SvcEntry {
    pub name: String,
    pub start: String,
    pub default: String,
}

#[derive(Deserialize, Clone)]
pub struct TaskEntry {
    pub path: String,
    pub name: String,
}

#[derive(Deserialize, Clone)]
pub struct PsEntry {
    pub check: String,
    pub apply: String,
    pub revert: String,
}

#[derive(Deserialize, Clone)]
pub struct Tweak {
    pub id: String,
    pub name: String,
    pub desc: String,
    pub category: String,
    #[serde(default)]
    pub recommended: bool,
    #[serde(default)]
    pub reboot: bool,
    #[serde(default)]
    pub explorer: bool,
    #[serde(default)]
    pub risk: Option<String>,
    #[serde(default)]
    pub reg: Vec<RegEntry>,
    #[serde(default)]
    pub svc: Vec<SvcEntry>,
    #[serde(default)]
    pub tasks: Vec<TaskEntry>,
    #[serde(default)]
    pub ps: Option<PsEntry>,
}

/// Lo que ve el frontend (sin scripts).
#[derive(Serialize, Clone)]
pub struct TweakInfo {
    pub id: String,
    pub name: String,
    pub desc: String,
    pub category: String,
    pub recommended: bool,
    pub reboot: bool,
    pub explorer: bool,
    pub risk: Option<String>,
}

pub fn catalog() -> &'static Vec<Tweak> {
    static CAT: OnceLock<Vec<Tweak>> = OnceLock::new();
    CAT.get_or_init(|| {
        serde_json::from_str(include_str!("../tweaks.json")).expect("tweaks.json inválido")
    })
}

pub fn find(id: &str) -> Result<&'static Tweak, String> {
    catalog()
        .iter()
        .find(|t| t.id == id)
        .ok_or_else(|| format!("Tweak desconocido: {id}"))
}

pub fn list() -> Vec<TweakInfo> {
    catalog()
        .iter()
        .map(|t| TweakInfo {
            id: t.id.clone(),
            name: t.name.clone(),
            desc: t.desc.clone(),
            category: t.category.clone(),
            recommended: t.recommended,
            reboot: t.reboot,
            explorer: t.explorer,
            risk: t.risk.clone(),
        })
        .collect()
}

/// "HKCU\Software\..." -> "Registry::HKEY_CURRENT_USER\Software\..."
fn reg_path(p: &str) -> String {
    let map = [
        ("HKCU\\", "HKEY_CURRENT_USER\\"),
        ("HKLM\\", "HKEY_LOCAL_MACHINE\\"),
        ("HKU\\", "HKEY_USERS\\"),
        ("HKCR\\", "HKEY_CLASSES_ROOT\\"),
    ];
    for (short, long) in map {
        if let Some(rest) = p.strip_prefix(short) {
            return format!("Registry::{long}{rest}");
        }
    }
    format!("Registry::{p}")
}

fn ps_value(v: &Value) -> String {
    match v {
        Value::Number(n) => n.to_string(),
        Value::String(s) => q(s),
        Value::Bool(b) => if *b { "1".into() } else { "0".into() },
        _ => "$null".into(),
    }
}

fn svc_start_cmd(name: &str, start: &str) -> String {
    if start == "AutomaticDelayed" {
        format!("sc.exe config {} start= delayed-auto | Out-Null", q(name))
    } else {
        format!("Set-Service -Name {} -StartupType {}", q(name), start)
    }
}

/// Expresión PowerShell que devuelve $true si el tweak está aplicado.
fn check_expr(t: &Tweak) -> String {
    let mut parts: Vec<String> = Vec::new();
    for r in &t.reg {
        parts.push(format!(
            "((Get-Reg {} {}) -eq {})",
            q(&reg_path(&r.path)),
            q(&r.name),
            ps_value(&r.value)
        ));
    }
    for s in &t.svc {
        parts.push(format!(
            "(& {{ $s = Get-Service -Name {} -ErrorAction SilentlyContinue; (-not $s) -or ([string]$s.StartType -eq {}) }})",
            q(&s.name),
            q(&s.start)
        ));
    }
    for k in &t.tasks {
        parts.push(format!(
            "(& {{ $t = Get-ScheduledTask -TaskPath {} -TaskName {} -ErrorAction SilentlyContinue; (-not $t) -or ([string]$t.State -eq 'Disabled') }})",
            q(&k.path),
            q(&k.name)
        ));
    }
    if let Some(p) = &t.ps {
        parts.push(format!("([bool](& {{ {} }}))", p.check));
    }
    if parts.is_empty() {
        "$false".into()
    } else {
        parts.join(" -and ")
    }
}

/// Envuelve cada paso en try/catch y acumula errores en $errs.
fn step(code: &str) -> String {
    format!("try {{ {code} }} catch {{ $errs += $_.Exception.Message }}\n")
}

fn apply_script(t: &Tweak) -> String {
    let mut s = String::new();
    for r in &t.reg {
        s += &step(&format!(
            "Set-Reg {} {} {} {}",
            q(&reg_path(&r.path)),
            q(&r.name),
            ps_value(&r.value),
            q(&r.kind)
        ));
    }
    for v in &t.svc {
        s += &step(&format!(
            "if (Get-Service -Name {n} -ErrorAction SilentlyContinue) {{ {stop}{cfg} }}",
            n = q(&v.name),
            stop = if v.start == "Disabled" {
                format!("Stop-Service -Name {} -Force -ErrorAction SilentlyContinue; ", q(&v.name))
            } else {
                String::new()
            },
            cfg = svc_start_cmd(&v.name, &v.start)
        ));
    }
    for k in &t.tasks {
        s += &step(&format!(
            "if (Get-ScheduledTask -TaskPath {p} -TaskName {n} -ErrorAction SilentlyContinue) {{ Disable-ScheduledTask -TaskPath {p} -TaskName {n} | Out-Null }}",
            p = q(&k.path),
            n = q(&k.name)
        ));
    }
    if let Some(p) = &t.ps {
        s += &step(&p.apply);
    }
    s
}

fn revert_script(t: &Tweak) -> String {
    let mut s = String::new();
    for r in &t.reg {
        let path = q(&reg_path(&r.path));
        s += &step(&match &r.default {
            Some(d) => format!("Set-Reg {} {} {} {}", path, q(&r.name), ps_value(d), q(&r.kind)),
            None => format!("Del-Reg {} {}", path, q(&r.name)),
        });
    }
    for v in &t.svc {
        s += &step(&format!(
            "if (Get-Service -Name {n} -ErrorAction SilentlyContinue) {{ {cfg} }}",
            n = q(&v.name),
            cfg = svc_start_cmd(&v.name, &v.default)
        ));
    }
    for k in &t.tasks {
        s += &step(&format!(
            "if (Get-ScheduledTask -TaskPath {p} -TaskName {n} -ErrorAction SilentlyContinue) {{ Enable-ScheduledTask -TaskPath {p} -TaskName {n} | Out-Null }}",
            p = q(&k.path),
            n = q(&k.name)
        ));
    }
    if let Some(p) = &t.ps {
        s += &step(&p.revert);
    }
    s
}

/// Comprueba el estado de varios tweaks con un único proceso de PowerShell.
pub fn check(ids: Option<Vec<String>>) -> Result<HashMap<String, bool>, String> {
    let list: Vec<&Tweak> = match &ids {
        Some(ids) => ids.iter().filter_map(|id| find(id).ok()).collect(),
        None => catalog().iter().collect(),
    };
    let mut script = String::from("$out = [ordered]@{}\n");
    for t in list {
        script += &format!(
            "try {{ $out[{id}] = [bool]({expr}) }} catch {{ $out[{id}] = $false }}\n",
            id = q(&t.id),
            expr = check_expr(t)
        );
    }
    script += "ConvertTo-Json -InputObject $out -Compress\n";
    ps::run_json(&script)
}

/// Aplica (enable=true) o revierte (enable=false) varios tweaks en un solo proceso.
pub fn set_many(ids: &[String], enable: bool) -> Result<(), String> {
    let mut script = String::from("$errs = @()\n");
    for id in ids {
        let t = find(id)?;
        script += &if enable { apply_script(t) } else { revert_script(t) };
    }
    script += "if ($errs.Count -gt 0) { throw ($errs -join ' | ') }\n";
    ps::run(&script).map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Comprobación básica: llaves, paréntesis y comillas equilibrados en todos los scripts generados.
    fn balanced(s: &str) -> Result<(), String> {
        let mut stack = Vec::new();
        let mut in_sq = false;
        let mut in_dq = false;
        let chars: Vec<char> = s.chars().collect();
        let mut i = 0;
        while i < chars.len() {
            let c = chars[i];
            if in_sq {
                if c == '\'' {
                    if chars.get(i + 1) == Some(&'\'') { i += 2; continue; }
                    in_sq = false;
                }
            } else if in_dq {
                if c == '`' { i += 2; continue; }
                if c == '"' { in_dq = false; }
            } else {
                match c {
                    '\'' => in_sq = true,
                    '"' => in_dq = true,
                    '(' | '{' | '[' => stack.push(c),
                    ')' | '}' | ']' => {
                        let open = stack.pop().ok_or(format!("cierre sin abrir '{c}' en {i}"))?;
                        let ok = matches!((open, c), ('(', ')') | ('{', '}') | ('[', ']'));
                        if !ok { return Err(format!("'{open}' cerrado con '{c}' en {i}")); }
                    }
                    _ => {}
                }
            }
            i += 1;
        }
        if in_sq || in_dq { return Err("comilla sin cerrar".into()); }
        if !stack.is_empty() { return Err(format!("sin cerrar: {:?}", stack)); }
        Ok(())
    }

    #[test]
    fn catalog_loads_and_ids_unique() {
        let c = catalog();
        assert!(c.len() > 40);
        let mut ids: Vec<_> = c.iter().map(|t| t.id.clone()).collect();
        ids.sort();
        ids.dedup();
        assert_eq!(ids.len(), c.len(), "IDs repetidos");
        for t in c {
            assert!(["privacidad", "interfaz", "sistema", "rendimiento", "seguridad"].contains(&t.category.as_str()), "{}", t.id);
            assert!(!t.reg.is_empty() || !t.svc.is_empty() || !t.tasks.is_empty() || t.ps.is_some(), "{} vacío", t.id);
        }
    }

    #[test]
    fn scripts_are_balanced() {
        balanced(crate::ps::PRELUDE).expect("prelude");
        for t in catalog() {
            for (kind, s) in [
                ("check", format!("$x = [bool]({})", check_expr(t))),
                ("apply", apply_script(t)),
                ("revert", revert_script(t)),
            ] {
                if let Err(e) = balanced(&s) {
                    panic!("{} {}: {}\n{}", t.id, kind, e, s);
                }
            }
        }
    }

    #[test]
    fn dump_example() {
        let t = find("telemetry").unwrap();
        println!("CHECK: {}\nAPPLY:\n{}\nREVERT:\n{}", check_expr(t), apply_script(t), revert_script(t));
    }
}
