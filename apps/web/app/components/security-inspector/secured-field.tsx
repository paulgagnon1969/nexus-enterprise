"use client";

import React, { type ReactNode, type CSSProperties, type HTMLAttributes } from "react";

interface SecuredFieldProps extends HTMLAttributes<HTMLSpanElement> {
  /**
   * The security resource key for this field (e.g., "petl.rcvAmount").
   * This is used to look up and manage the field's security policy.
   */
  secKey: string;

  /**
   * The content to wrap.
   */
  children: ReactNode;

  /**
   * Display mode for the wrapper.
   * - "inline" for text/values within a line (default)
   * - "block" for sections/cards
   */
  display?: "inline" | "block";

  /**
   * Additional styles to apply to the wrapper.
   */
  style?: CSSProperties;
}

/**
 * Wrapper component that marks content as a secured field.
 * 
 * In development mode, holding S and right-clicking on this element
 * will open the Security Inspector overlay to view/edit the field's
 * security policy.
 * 
 * Usage:
 * ```tsx
 * <SecuredField secKey="petl.rcvAmount">
 *   <span>{rcvAmount.toLocaleString()}</span>
 * </SecuredField>
 * ```
 */
export function SecuredField({
  secKey,
  children,
  display = "inline",
  style,
  ...rest
}: SecuredFieldProps) {
  const displayStyles: CSSProperties =
    display === "inline" ? { display: "inline" } : { display: "block" };

  return (
    <span
      data-sec-key={secKey}
      style={{ ...displayStyles, ...style }}
      {...rest}
    >
      {children}
    </span>
  );
}

/**
 * HOC version for wrapping existing components.
 * 
 * Usage:
 * ```tsx
 * const SecuredRcvAmount = withSecuredField("petl.rcvAmount")(MyComponent);
 * ```
 */
export function withSecuredField<P extends object>(secKey: string) {
  return function WrappedComponent(Component: React.ComponentType<P>) {
    return function SecuredComponent(props: P) {
      return (
        <span data-sec-key={secKey} style={{ display: "contents" }}>
          <Component {...props} />
        </span>
      );
    };
  };
}

/**
 * Simple inline secured span for text values.
 * 
 * Usage:
 * ```tsx
 * <SecuredValue secKey="petl.rcvAmount">{rcvAmount}</SecuredValue>
 * ```
 */
export function SecuredValue({
  secKey,
  children,
  style,
  ...rest
}: Omit<SecuredFieldProps, "display">) {
  return (
    <span data-sec-key={secKey} style={style} {...rest}>
      {children}
    </span>
  );
}
