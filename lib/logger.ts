type LogLevel = "info" | "warn" | "error";

type LogFields = Record<string, unknown>;

function normalizeError(error: unknown): LogFields {
  if (error instanceof Error) {
    return {
      error_name: error.name,
      error_message: error.message,
      error_stack: error.stack,
    };
  }

  return {
    error_message: String(error),
  };
}

function write(level: LogLevel, event: string, fields: LogFields = {}) {
  const payload = {
    level,
    event,
    timestamp: new Date().toISOString(),
    environment: process.env.VERCEL ? "vercel" : "local",
    vercel_region: process.env.VERCEL_REGION,
    vercel_url: process.env.VERCEL_URL,
    ...fields,
  };

  const line = JSON.stringify(payload);

  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export function logInfo(event: string, fields?: LogFields) {
  write("info", event, fields);
}

export function logWarn(event: string, fields?: LogFields) {
  write("warn", event, fields);
}

export function logError(event: string, error: unknown, fields: LogFields = {}) {
  write("error", event, {
    ...fields,
    ...normalizeError(error),
  });
}
