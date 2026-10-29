import { z } from "zod";
import { check, indianMobile, text, type Validation } from "./fields";
import type { IndianMobile } from "./phone";

/** A student as the owner enters them (TSD: students). */
export type StudentInput = {
  name: string;
  parentName: string;
  /** Reminders and receipts go to this number. */
  parentPhone: IndianMobile;
  /** The parent agreed to receive WhatsApp messages (TSD: Consent). */
  whatsappOptIn: boolean;
};

const studentSchema = z.object({
  name: text("Enter the student’s name.", 80, "Keep the student’s name to 80 characters or fewer."),
  parentName: text("Enter the parent’s name.", 80, "Keep the parent’s name to 80 characters or fewer."),
  parentPhone: indianMobile(),
  whatsappOptIn: z.boolean({ error: "Say whether the parent agreed to WhatsApp messages." }).default(false),
});

export const validateStudent = (input: unknown): Validation<StudentInput> => check(studentSchema, input);
