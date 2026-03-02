"use client";

import { Node, mergeAttributes } from "@tiptap/core";

export interface TemplateFieldOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    templateField: {
      /**
       * Insert a template field placeholder at the current cursor position.
       */
      insertTemplateField: (attrs: {
        fieldKey: string;
        fieldLabel: string;
        fieldType: string;
        required?: boolean;
        group?: string;
      }) => ReturnType;
    };
  }
}

/**
 * TipTap Node extension that renders {{FIELD_KEY}} as styled inline pills.
 * - `atom: true` means the node cannot be split by typing inside it
 * - `inline: true` means it sits inside paragraph text flow
 * - Stores field metadata as node attributes
 */
export const TemplateField = Node.create<TemplateFieldOptions>({
  name: "templateField",

  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      fieldKey: { default: "FIELD" },
      fieldLabel: { default: "Field" },
      fieldType: { default: "text" },
      required: { default: false },
      group: { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-template-field]',
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const key = node.attrs.fieldKey as string;
    const label = node.attrs.fieldLabel as string;
    const type = node.attrs.fieldType as string;
    const typeIcon = FIELD_TYPE_ICONS[type] || "📝";

    return [
      "span",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-template-field": key,
        "data-field-type": type,
        "data-field-label": label,
        "data-field-required": node.attrs.required ? "true" : "false",
        "data-field-group": node.attrs.group || "",
        class: "template-field-pill",
        contenteditable: "false",
        style: `
          display: inline-flex;
          align-items: center;
          gap: 3px;
          padding: 2px 8px;
          border-radius: 4px;
          background-color: ${FIELD_TYPE_COLORS[type] || "#dbeafe"};
          border: 1px solid ${FIELD_TYPE_BORDER_COLORS[type] || "#93c5fd"};
          font-size: 12px;
          font-weight: 500;
          color: #1e3a5f;
          white-space: nowrap;
          cursor: pointer;
          user-select: none;
          vertical-align: baseline;
          line-height: 1.6;
        `.replace(/\s+/g, " ").trim(),
      }),
      `${typeIcon} {{${key}}}`,
    ];
  },

  addCommands() {
    return {
      insertTemplateField:
        (attrs) =>
        ({ chain }) => {
          return chain()
            .insertContent({
              type: this.name,
              attrs,
            })
            .run();
        },
    };
  },
});

// Field type visual config
const FIELD_TYPE_ICONS: Record<string, string> = {
  text: "📝",
  date: "📅",
  phone: "📞",
  email: "✉️",
  number: "🔢",
  signature: "✍️",
  initials: "✏️",
  checkbox: "☑️",
  currency: "💲",
  address: "📍",
};

const FIELD_TYPE_COLORS: Record<string, string> = {
  text: "#dbeafe",
  date: "#fef3c7",
  phone: "#d1fae5",
  email: "#ede9fe",
  number: "#fce7f3",
  signature: "#fef9c3",
  initials: "#fef9c3",
  checkbox: "#e0e7ff",
  currency: "#d1fae5",
  address: "#f3e8ff",
};

const FIELD_TYPE_BORDER_COLORS: Record<string, string> = {
  text: "#93c5fd",
  date: "#fcd34d",
  phone: "#6ee7b7",
  email: "#c4b5fd",
  number: "#f9a8d4",
  signature: "#fde047",
  initials: "#fde047",
  checkbox: "#a5b4fc",
  currency: "#6ee7b7",
  address: "#d8b4fe",
};

export const FIELD_TYPES = [
  { type: "text", label: "Text Field", icon: "📝" },
  { type: "date", label: "Date", icon: "📅" },
  { type: "phone", label: "Phone", icon: "📞" },
  { type: "email", label: "Email", icon: "✉️" },
  { type: "number", label: "Number", icon: "🔢" },
  { type: "currency", label: "Currency", icon: "💲" },
  { type: "address", label: "Address", icon: "📍" },
  { type: "signature", label: "Signature Block", icon: "✍️" },
  { type: "initials", label: "Initials", icon: "✏️" },
  { type: "checkbox", label: "Checkbox", icon: "☑️" },
] as const;

export default TemplateField;
