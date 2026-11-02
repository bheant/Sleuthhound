"use client";

import type { InputHTMLAttributes } from "react";
import { errorText, field } from "./auth-ui";

// A labelled field for the account screens. The label is read by screen
// readers; the placeholder says the same on screen, as the design has it.

type Props = InputHTMLAttributes<HTMLInputElement> & { id: string; label: string; error?: string | null; first?: boolean };

export function Field({ id, label, error, first = false, className = "", ...input }: Props) {
  return (
    <>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        placeholder={label}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`${field} ${first ? "" : "mt-3"} ${error ? "border-error" : "border-rule"} ${className}`}
        {...input}
      />
      {error ? (
        <p id={`${id}-error`} role="alert" className={errorText}>
          {error}
        </p>
      ) : null}
    </>
  );
}

export function FormError({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className={errorText}>
      {message}
    </p>
  ) : null;
}

export const MIN_PASSWORD = 12;

export function passwordProblem(password: string, confirm: string): string | null {
  if (password.length > 0 && password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  if (confirm && confirm !== password) return "The passwords don’t match.";
  return null;
}
