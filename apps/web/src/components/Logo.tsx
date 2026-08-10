export function Logo() {
  return (
    <svg
      aria-hidden="true"
      className="agent-logo"
      focusable="false"
      width="42"
      height="42"
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M15 28c-3-4-8-2-7 3 1 4 9 13 13 19 4 6 10 8 18 8 10 0 16-6 17-15l2-13c1-4-2-7-5-6-2 0-3 2-4 4l-3 6 3-19c1-4-2-7-5-7s-5 2-5 6l-3 15 1-20c0-4-3-6-6-5s-5 3-5 6l1 19-3-18c-1-4-4-6-7-5s-4 4-3 8l6 21-4-7Z"
        fill="var(--logo-fill, var(--panel, white))"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3.5"
      />
      <ellipse cx="29" cy="39" rx="3" ry="4" fill="currentColor" />
      <ellipse cx="40" cy="39" rx="3" ry="4" fill="currentColor" />
      <circle cx="30" cy="38" r="1" fill="var(--logo-fill, var(--panel, white))" />
      <circle cx="41" cy="38" r="1" fill="var(--logo-fill, var(--panel, white))" />
      <path
        d="M29 48c3 3 8 3 11 0"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2.5"
      />
    </svg>
  );
}
