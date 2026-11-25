//! Información del sistema, medidores en vivo y acciones rápidas (RAM, punto de restauración...).

use crate::ps;
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader};
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use std::time::Instant;
use sysinfo::{Disks, Networks, ProcessesToUpdate, System};

#[derive(Serialize)]
pub struct DiskInfo {
    pub mount: String,
    pub name: String,
    pub total: u64,
    pub free: u64,
}

#[derive(Serialize)]
pub struct ProcInfo {
    pub pid: u32,
    pub name: String,
    pub cpu: f32,
    pub mem: u64,
}

#[derive(Serialize)]
pub struct LiveStats {
    pub cpu: f32,
    pub cores: Vec<f32>,
    pub freq_mhz: u64,
    pub ram_used: u64,
    pub ram_total: u64,
    pub swap_used: u64,
    pub swap_total: u64,
    /// -1 si no está disponible.
    pub gpu: f32,
    pub disk_read: u64,
    pub disk_write: u64,
    pub net_down: u64,
    pub net_up: u64,
    pub disks: Vec<DiskInfo>,
    pub processes: usize,
    pub top: Vec<ProcInfo>,
    pub uptime: u64,
}

pub struct Monitor {
    sys: System,
    nets: Networks,
    disks: Disks,
    last: Instant,
    gpu: Arc<Mutex<f32>>,
}

impl Monitor {
    pub fn new() -> Self {
        let mut sys = System::new();
        sys.refresh_cpu_usage();
        sys.refresh_memory();
        sys.refresh_processes(ProcessesToUpdate::All, true);
        let gpu = Arc::new(Mutex::new(-1.0));
        start_gpu_sampler(gpu.clone());
        Monitor {
            sys,
            nets: Networks::new_with_refreshed_list(),
            disks: Disks::new_with_refreshed_list(),
            last: Instant::now(),
            gpu,
        }
    }

    pub fn sample(&mut self) -> LiveStats {
        let elapsed = self.last.elapsed().as_secs_f64().max(0.2);
        self.last = Instant::now();

        self.sys.refresh_cpu_usage();
        self.sys.refresh_memory();
        self.sys.refresh_processes(ProcessesToUpdate::All, true);
        self.nets.refresh(true);
        self.disks.refresh(true);

        let ncpu = self.sys.cpus().len().max(1) as f32;
        let (mut rd, mut wr) = (0u64, 0u64);
        let mut procs: Vec<ProcInfo> = Vec::new();
        for (pid, p) in self.sys.processes() {
            let du = p.disk_usage();
            rd += du.read_bytes;
            wr += du.written_bytes;
            let pid = pid.as_u32();
            if pid > 4 {
                procs.push(ProcInfo {
                    pid,
                    name: p.name().to_string_lossy().to_string(),
                    cpu: p.cpu_usage() / ncpu,
                    mem: p.memory(),
                });
            }
        }
        // Agrupa por nombre (chrome.exe x30 -> una fila) para que la lista sea útil.
        let mut grouped: std::collections::HashMap<String, ProcInfo> = Default::default();
        for p in procs {
            grouped
                .entry(p.name.to_lowercase())
                .and_modify(|g| {
                    g.cpu += p.cpu;
                    g.mem += p.mem;
                })
                .or_insert(p);
        }
        let mut top: Vec<ProcInfo> = grouped.into_values().collect();
        top.sort_by(|a, b| b.mem.cmp(&a.mem));
        top.truncate(12);

        let (mut down, mut up) = (0u64, 0u64);
        for (_, n) in self.nets.iter() {
            down += n.received();
            up += n.transmitted();
        }

        LiveStats {
            cpu: self.sys.global_cpu_usage(),
            cores: self.sys.cpus().iter().map(|c| c.cpu_usage()).collect(),
            freq_mhz: self.sys.cpus().first().map(|c| c.frequency()).unwrap_or(0),
            ram_used: self.sys.used_memory(),
            ram_total: self.sys.total_memory(),
            swap_used: self.sys.used_swap(),
            swap_total: self.sys.total_swap(),
            gpu: *self.gpu.lock().unwrap(),
            disk_read: (rd as f64 / elapsed) as u64,
            disk_write: (wr as f64 / elapsed) as u64,
            net_down: (down as f64 / elapsed) as u64,
            net_up: (up as f64 / elapsed) as u64,
            disks: self
                .disks
                .iter()
                .map(|d| DiskInfo {
                    mount: d.mount_point().to_string_lossy().to_string(),
                    name: d.name().to_string_lossy().to_string(),
                    total: d.total_space(),
                    free: d.available_space(),
                })
                .collect(),
            processes: self.sys.processes().len(),
            top,
            uptime: System::uptime(),
        }
    }

    /// Cierra todos los procesos con ese nombre (p. ej. todas las instancias de chrome.exe).
    /// Se niega a cerrar procesos críticos de Windows.
    pub fn kill_name(&mut self, name: &str) -> Result<usize, String> {
        const CRITICAL: &[&str] = &[
            "system", "registry", "smss.exe", "csrss.exe", "wininit.exe", "winlogon.exe", "services.exe",
            "lsass.exe", "svchost.exe", "dwm.exe", "fontdrvhost.exe", "memcompression", "secure system",
            "lsaiso.exe", "audiodg.exe", "optimizador.exe", "msmpeng.exe",
        ];
        if CRITICAL.iter().any(|c| c.eq_ignore_ascii_case(name)) {
            return Err(format!("{name} es un proceso crítico de Windows y no se puede cerrar."));
        }
        self.sys.refresh_processes(ProcessesToUpdate::All, true);
        let me = std::process::id();
        let mut n = 0;
        for (pid, p) in self.sys.processes() {
            if pid.as_u32() != me && p.name().to_string_lossy().eq_ignore_ascii_case(name) && p.kill() {
                n += 1;
            }
        }
        Ok(n)
    }
}

/// Uso de GPU (motor 3D) leído de los contadores de rendimiento vía WMI en un PowerShell
/// que vive en segundo plano. Se usa la clase WMI (no Get-Counter) porque los nombres de
/// los contadores cambian según el idioma de Windows. El proceso se cierra solo al cerrar la app.
fn start_gpu_sampler(gpu: Arc<Mutex<f32>>) {
    if !cfg!(windows) {
        return;
    }
    let script = format!(
        r#"$ErrorActionPreference = 'SilentlyContinue'
$parent = {pid}
while (Get-Process -Id $parent) {{
  $v = (Get-CimInstance -ClassName Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine -Filter "Name LIKE '%engtype_3D%'" | Measure-Object -Property UtilizationPercentage -Sum).Sum
  if ($null -eq $v) {{ [Console]::Out.WriteLine('-1') }} else {{ [Console]::Out.WriteLine([math]::Min(100, [math]::Round($v, 1))) }}
  [Console]::Out.Flush()
  Start-Sleep -Milliseconds 900
}}"#,
        pid = std::process::id()
    );
    std::thread::spawn(move || {
        let path = std::env::temp_dir().join(format!("optimizador_gpu_{}.ps1", std::process::id()));
        if std::fs::write(&path, script).is_err() {
            return;
        }
        let child = ps::command("powershell.exe")
            .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File"])
            .arg(&path)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn();
        let Ok(mut child) = child else { return };
        if let Some(out) = child.stdout.take() {
            for line in BufReader::new(out).lines().map_while(Result::ok) {
                if let Ok(v) = line.trim().replace(',', ".").parse::<f32>() {
                    *gpu.lock().unwrap() = v;
                }
            }
        }
        let _ = child.wait();
        let _ = std::fs::remove_file(&path);
    });
}

#[derive(Serialize, Deserialize, Default)]
pub struct SysInfo {
    pub os: String,
    pub version: String,
    pub build: String,
    pub host: String,
    pub user: String,
    pub cpu: String,
    pub cores: u32,
    pub threads: u32,
    pub gpus: Vec<String>,
    pub ram_total: u64,
    pub ram_speed: u32,
    pub board: String,
    pub drives: Vec<String>,
    pub is_admin: bool,
    pub laptop: bool,
}

pub fn info() -> Result<SysInfo, String> {
    ps::run_json(
        r#"
$os = Get-CimInstance Win32_OperatingSystem
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$cs = Get-CimInstance Win32_ComputerSystem
$bb = Get-CimInstance Win32_BaseBoard -ErrorAction SilentlyContinue
$mem = @(Get-CimInstance Win32_PhysicalMemory -ErrorAction SilentlyContinue)
$gpus = @(Get-CimInstance Win32_VideoController | Where-Object { $_.Name -notmatch 'Basic|Virtual|Parsec|Meta|Remote' } | ForEach-Object { $_.Name })
$drives = @()
try { $drives = @(Get-PhysicalDisk | ForEach-Object { "$($_.FriendlyName) · $($_.MediaType) · $([math]::Round($_.Size / 1GB)) GB" }) } catch { }
$display = (Get-Reg 'Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows NT\CurrentVersion' 'DisplayVersion')
$ubr = (Get-Reg 'Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows NT\CurrentVersion' 'UBR')
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$battery = @(Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue).Count -gt 0
ConvertTo-Json -Compress -InputObject ([ordered]@{
  os = ($os.Caption -replace '^Microsoft ', '')
  version = [string]$display
  build = "$($os.BuildNumber).$ubr"
  host = $env:COMPUTERNAME
  user = $env:USERNAME
  cpu = ($cpu.Name -replace '\s+', ' ').Trim()
  cores = [int]$cpu.NumberOfCores
  threads = [int]$cpu.NumberOfLogicalProcessors
  gpus = @($gpus)
  ram_total = [uint64]$cs.TotalPhysicalMemory
  ram_speed = [int](($mem | Measure-Object -Property ConfiguredClockSpeed -Maximum).Maximum)
  board = "$($bb.Manufacturer) $($bb.Product)".Trim()
  drives = @($drives)
  is_admin = [bool]$admin
  laptop = [bool]$battery
})
"#,
    )
}

/// Libera RAM: vacía el working set de todos los procesos y purga la lista "standby"
/// (la caché que Windows a veces no suelta). Devuelve bytes de RAM libre ganados.
pub fn clean_ram() -> Result<i64, String> {
    let out = ps::run(
        r#"
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class MemClean {
  [DllImport("psapi.dll")] public static extern bool EmptyWorkingSet(IntPtr h);
  [DllImport("ntdll.dll")] static extern int NtSetSystemInformation(int cls, ref int info, int len);
  [DllImport("advapi32.dll", SetLastError = true)] static extern bool OpenProcessToken(IntPtr p, uint access, out IntPtr tok);
  [DllImport("advapi32.dll", SetLastError = true)] static extern bool LookupPrivilegeValue(string sys, string name, out long luid);
  [StructLayout(LayoutKind.Sequential, Pack = 1)] struct TP { public int Count; public long Luid; public int Attr; }
  [DllImport("advapi32.dll", SetLastError = true)] static extern bool AdjustTokenPrivileges(IntPtr tok, bool dis, ref TP n, int len, IntPtr p, IntPtr r);
  [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  static void Enable(string priv) {
    IntPtr tok;
    if (!OpenProcessToken(GetCurrentProcess(), 0x28, out tok)) return;
    TP tp = new TP(); tp.Count = 1; tp.Attr = 2;
    if (LookupPrivilegeValue(null, priv, out tp.Luid)) AdjustTokenPrivileges(tok, false, ref tp, 0, IntPtr.Zero, IntPtr.Zero);
    CloseHandle(tok);
  }
  public static int PurgeStandby() {
    Enable("SeProfileSingleProcessPrivilege");
    int cmd = 4; // MemoryPurgeStandbyList
    return NtSetSystemInformation(80, ref cmd, 4); // SystemMemoryListInformation
  }
  public static void EmptyAll() {
    Enable("SeDebugPrivilege");
    foreach (var p in System.Diagnostics.Process.GetProcesses()) {
      try { EmptyWorkingSet(p.Handle); } catch { } finally { p.Dispose(); }
    }
  }
}
"@
$before = (Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory
[MemClean]::EmptyAll()
$r = [MemClean]::PurgeStandby()
Start-Sleep -Milliseconds 300
$after = (Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory
[Console]::Out.Write((($after - $before) * 1024))
"#,
    )?;
    out.trim().parse::<i64>().map_err(|_| format!("Respuesta inesperada: {out}"))
}

pub fn create_restore_point(desc: &str) -> Result<(), String> {
    ps::run(&format!(
        r#"Enable-ComputerRestore -Drive "$env:SystemDrive\" -ErrorAction SilentlyContinue
Set-Reg 'Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows NT\CurrentVersion\SystemRestore' 'SystemRestorePointCreationFrequency' 0
Checkpoint-Computer -Description {} -RestorePointType 'MODIFY_SETTINGS'"#,
        ps::q(desc)
    ))
    .map(|_| ())
}

pub fn open_restore_ui() -> Result<(), String> {
    ps::command("rstrui.exe").spawn().map(|_| ()).map_err(|e| e.to_string())
}

pub fn restart_explorer() -> Result<(), String> {
    ps::run("Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 1500; if (-not (Get-Process explorer -ErrorAction SilentlyContinue)) { Start-Process explorer.exe }")
        .map(|_| ())
}
