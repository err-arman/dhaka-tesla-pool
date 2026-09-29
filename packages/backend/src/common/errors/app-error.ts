// An error that carries the HTTP status and machine-readable code to send to the client.
// Services throw these; controllers never build error responses by hand.
export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string = 'ERROR',
  ) {
    super(message);
    this.name = 'AppError';
  }
}
