import React, { useState, useRef, useEffect } from "react";

export interface CustomSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface CustomSelectProps {
  value: string;
  onChange: (val: string) => void;
  options: CustomSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  title?: string;
  ariaLabel?: string;
  placement?: "top" | "bottom";
}

export function CustomSelect({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  className = "",
  title,
  ariaLabel,
  placement = "bottom",
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("pointerdown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("pointerdown", handleClickOutside);
    };
  }, [isOpen]);

  const selectedOption = options.find((o) => o.value === value);
  const displayLabel = selectedOption ? selectedOption.label : placeholder || "Select...";

  return (
    <div className={`custom-select-container ${className}`} ref={containerRef} aria-label={ariaLabel}>
      <button
        type="button"
        className={`custom-select-trigger ${isOpen ? "open" : ""}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        data-tip={isOpen ? undefined : title}
      >
        <span className="custom-select-label">{displayLabel}</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="lucide lucide-chevron-down custom-select-chevron"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      <div className={`custom-select-panel placement-${placement} ${isOpen ? "open" : ""}`}>
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`custom-select-item ${opt.value === value ? "active" : ""}`}
            disabled={opt.disabled}
            onClick={() => {
              if (opt.disabled) return;
              onChange(opt.value);
              setIsOpen(false);
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
