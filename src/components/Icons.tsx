import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 18, children, ...rest }: P) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconHome = (p: P) => (
  <Svg {...p}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
    <path d="M10 21v-6h4v6" />
  </Svg>
);

export const IconGauge = (p: P) => (
  <Svg {...p}>
    <path d="M12 14l4-4" />
    <path d="M3.3 17a9 9 0 1 1 17.4 0" />
    <circle cx="12" cy="14" r="1.3" />
  </Svg>
);

export const IconSliders = (p: P) => (
  <Svg {...p}>
    <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
    <circle cx="16" cy="6" r="2" />
    <circle cx="10" cy="12" r="2" />
    <circle cx="18" cy="18" r="2" />
  </Svg>
);

export const IconBox = (p: P) => (
  <Svg {...p}>
    <path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" />
    <path d="m3 8 9 5 9-5M12 13v8" />
  </Svg>
);

export const IconGamepad = (p: P) => (
  <Svg {...p}>
    <path d="M6 8h12a4 4 0 0 1 3.9 4.9l-1 4.3a2.4 2.4 0 0 1-4.1 1.1L14.5 16h-5l-2.3 2.3a2.4 2.4 0 0 1-4.1-1.1l-1-4.3A4 4 0 0 1 6 8Z" />
    <path d="M8 11v3M6.5 12.5h3M15.5 12h.01M17.5 13.5h.01" />
  </Svg>
);

export const IconBolt = (p: P) => (
  <Svg {...p}>
    <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
  </Svg>
);

export const IconBroom = (p: P) => (
  <Svg {...p}>
    <path d="M19 3 11.5 10.5" />
    <path d="M9.5 9.5 14.5 14.5" />
    <path d="M9.5 9.5C6 10 4 12.5 3 21c8.5-1 11-3 11.5-6.5" />
    <path d="M6.5 16.5 8 18M8 13.5l2.5 2.5" />
  </Svg>
);

export const IconSearch = (p: P) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Svg>
);

export const IconShield = (p: P) => (
  <Svg {...p}>
    <path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3Z" />
    <path d="m9 12 2 2 4-4" />
  </Svg>
);

export const IconRestore = (p: P) => (
  <Svg {...p}>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5" />
    <path d="M12 7v5l3 2" />
  </Svg>
);

export const IconCpu = (p: P) => (
  <Svg {...p}>
    <rect x="6" y="6" width="12" height="12" rx="2" />
    <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
    <path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" />
  </Svg>
);

export const IconCheck = (p: P) => (
  <Svg {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Svg>
);

export const IconAlert = (p: P) => (
  <Svg {...p}>
    <path d="M12 3 2 20h20L12 3Z" />
    <path d="M12 10v4M12 17h.01" />
  </Svg>
);

export const IconRefresh = (p: P) => (
  <Svg {...p}>
    <path d="M20 11a8 8 0 0 0-14.6-4.5L4 8" />
    <path d="M4 3v5h5" />
    <path d="M4 13a8 8 0 0 0 14.6 4.5L20 16" />
    <path d="M20 21v-5h-5" />
  </Svg>
);

export const IconX = (p: P) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);

export const IconRocket = (p: P) => (
  <Svg {...p}>
    <path d="M14 4c3-1.5 6-1 6-1s.5 3-1 6l-6.5 6.5-5-5L14 4Z" />
    <path d="M7.5 10.5 4 10l2.5-3.5h4M13.5 16.5 14 20l3.5-2.5v-4" />
    <path d="M6 18c-1.5 0-2.5 1-3 3 2-.5 3-1.5 3-3Z" />
    <circle cx="15.5" cy="8.5" r="1.3" />
  </Svg>
);
