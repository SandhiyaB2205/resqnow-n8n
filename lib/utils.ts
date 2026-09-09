import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function stripDoctorQualifications(value: string | null | undefined): string | null | undefined {
  if (value == null) return value
  return value
    .replace(/\s*,?\s*(?:MBBS|MD|MS|DM|MCh|DNB|FRCS|FRCP|PhD|BAMS|BHMS)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[\s,]+$/g, "")
    .trim()
}
