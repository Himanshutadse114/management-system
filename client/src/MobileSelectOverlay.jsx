import React, { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { createPortal } from "react-dom";
import "./mobile-select.css";

function labelFor(select) {
  const ariaLabel = select.getAttribute("aria-label")?.trim();
  if (ariaLabel) return ariaLabel;
  const labelledBy = select.getAttribute("aria-labelledby");
  if (labelledBy) {
    const label = document.getElementById(labelledBy)?.textContent?.trim();
    if (label) return label;
  }
  const fieldLabel = select.closest("label");
  const directLabel = fieldLabel?.querySelector(":scope > span")?.textContent?.trim();
  const textLabel = Array.from(fieldLabel?.childNodes || [])
    .filter((node) => node !== select && node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent?.trim())
    .find(Boolean);
  return directLabel || textLabel || select.name || "Choose an option";
}

function optionsFor(select) {
  return Array.from(select.options).map((option) => ({
    value: option.value,
    label: option.label || option.textContent || option.value,
    disabled: option.disabled,
    selected: option.selected,
  }));
}

export default function MobileSelectOverlay() {
  const [picker, setPicker] = useState(null);

  useEffect(() => {
    function interceptPicker(event) {
      const select = event.target?.closest?.("select");
      if (!select || select.multiple || select.disabled) return;
      const isMobilePicker =
        /Android/i.test(navigator.userAgent) ||
        window.matchMedia("(max-width: 900px) and (pointer: coarse)").matches;
      if (!isMobilePicker) return;
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      setPicker({
        select,
        title: labelFor(select),
        options: optionsFor(select),
        light: Boolean(select.closest(".scorm-theme-light")),
      });
    }

    const listenerOptions = { capture: true, passive: false };
    document.addEventListener("pointerdown", interceptPicker, listenerOptions);
    document.addEventListener("touchstart", interceptPicker, listenerOptions);
    document.addEventListener("mousedown", interceptPicker, listenerOptions);
    document.addEventListener("click", interceptPicker, listenerOptions);
    return () => {
      document.removeEventListener("pointerdown", interceptPicker, true);
      document.removeEventListener("touchstart", interceptPicker, true);
      document.removeEventListener("mousedown", interceptPicker, true);
      document.removeEventListener("click", interceptPicker, true);
    };
  }, []);

  useEffect(() => {
    if (!picker) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [picker]);

  if (!picker) return null;

  function choose(value) {
    const { select } = picker;
    select.value = value;
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
    select.focus({ preventScroll: true });
    setPicker(null);
  }

  return createPortal(
    <div
      className={`mobile-select-backdrop${picker.light ? " is-light" : ""}`}
      role="presentation"
      onClick={() => setPicker(null)}
    >
      <section
        className="mobile-select-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={picker.title}
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span>Select</span>
            <h2>{picker.title}</h2>
          </div>
          <button
            type="button"
            className="mobile-select-close"
            onClick={() => setPicker(null)}
            aria-label="Close choices"
          >
            <X size={20} />
          </button>
        </header>
        <div className="mobile-select-options" role="radiogroup">
          {picker.options.map((option) => (
            <button
              type="button"
              key={`${option.value}-${option.label}`}
              className={option.selected ? "is-selected" : ""}
              disabled={option.disabled}
              role="radio"
              aria-checked={option.selected}
              onClick={() => choose(option.value)}
            >
              <span>{option.label}</span>
              <i aria-hidden="true">
                {option.selected && <Check size={14} strokeWidth={3} />}
              </i>
            </button>
          ))}
        </div>
      </section>
    </div>,
    document.body,
  );
}
