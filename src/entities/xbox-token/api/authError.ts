// A short, readable account of why one step of Xbox sign-in failed: which step,
// the HTTP status, and the start of what the service answered (error codes, not
// tokens). The failure message is shown to the user, so it stays small -- the
// raw error carries a long stack trace.
export const describeAuthError = (step: string, error: any): string => {
  const status = error?.response?.status;
  const data = error?.response?.data;
  let body = '';
  if (typeof data === 'string') {
    body = data;
  } else if (data && typeof data === 'object') {
    try {
      body = JSON.stringify(data);
    } catch {
      body = '';
    }
  }
  const parts = [`${step} failed`];
  if (status) {
    parts.push(`status ${status}`);
  } else if (error?.message) {
    parts.push(String(error.message));
  }
  const text = parts.join(': ');
  return body ? `${text} (${body.slice(0, 200)})` : text;
};
