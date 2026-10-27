/**
 * POL-01 D8 (recette F11): a scheduled or confirmed appointment whose end has passed is « à clôturer ».
 * Display only; the server's completion rules are unchanged. A requested reschedule stays « Report demandé ».
 */
export const appointmentStatusesToClose = ["scheduled", "confirmed"] as const;
export function isAppointmentToClose(
  appointment: { status: string; scheduledEnd: string },
  now: Date,
): boolean {
  return (
    appointmentStatusesToClose.some(
      (status) => status === appointment.status,
    ) && new Date(appointment.scheduledEnd).getTime() <= now.getTime()
  );
}
