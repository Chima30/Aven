/** Shared shape returned by every form Server Action (used with useActionState). */
export interface FormState {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
  /** Echo of safe (non-secret) field values so the form keeps what the user typed. */
  values?: Record<string, string>;
}

export const initialFormState: FormState = { status: "idle" };

export function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}
