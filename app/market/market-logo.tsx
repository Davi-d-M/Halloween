type MarketLogoProps = {
  className?: string;
};

export default function MarketLogo({ className }: MarketLogoProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="48" height="48" rx="15" fill="url(#market-logo-bg)" />
      <path d="M29.7 9.2a13.8 13.8 0 1 0 9.1 23.5A15.2 15.2 0 0 1 29.7 9.2Z" fill="#F6D9A8" />
      <path d="M10.5 23.5h27l-2.4 5.1H12.9l-2.4-5.1Z" fill="#FFF8EC" />
      <path d="M12.2 28.6h23.6v10.1H12.2V28.6Z" fill="#FFF8EC" />
      <path d="M12.2 28.6h23.6v3.6H12.2v-3.6Z" fill="#E7A46A" />
      <path d="M16.1 28.6v3.6m7.9-3.6v3.6m7.9-3.6v3.6" stroke="#FFF8EC" strokeWidth="1.6" />
      <path d="M17.1 38.7v-5.8h5.3v5.8m5.5 0v-5.8h5.3v5.8" stroke="#271D35" strokeWidth="1.7" />
      <path d="m24 13.2.7 1.5 1.6.2-1.2 1.1.3 1.6-1.4-.8-1.4.8.3-1.6-1.2-1.1 1.6-.2.7-1.5Z" fill="#F6D9A8" />
      <defs>
        <linearGradient id="market-logo-bg" x1="5" y1="3" x2="43" y2="46" gradientUnits="userSpaceOnUse">
          <stop stopColor="#56355F" />
          <stop offset="1" stopColor="#21182F" />
        </linearGradient>
      </defs>
    </svg>
  );
}
