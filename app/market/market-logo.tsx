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
      <rect width="48" height="48" rx="15" fill="#24172E" />
      <circle cx="24" cy="24" r="18.5" stroke="#EBCB98" strokeOpacity=".14" />
      <path
        d="M31.9 9.6a15.7 15.7 0 1 0 7 26.8A17.2 17.2 0 0 1 31.9 9.6Z"
        fill="#F1D5A8"
      />
      <path
        d="m35 12.2.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9.9-2.3Z"
        fill="#FFF9EF"
      />
      <path
        d="m13.8 31.7.6 1.5 1.5.6-1.5.6-.6 1.5-.6-1.5-1.5-.6 1.5-.6.6-1.5Z"
        fill="#D9AE77"
      />
    </svg>
  );
}
