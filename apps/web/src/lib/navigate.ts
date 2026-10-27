/** A full-page navigation, e.g. to Google's sign-in. Its own module so tests can replace it. */
export function navigate(url: string): void {
  window.location.assign(url);
}
