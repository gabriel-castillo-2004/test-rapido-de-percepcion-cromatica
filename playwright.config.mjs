// Offline Playwright configuration and console/page error guard for static web template (INV-03, INV-13, AC-2.5)
export function attachErrorGuards(page) {
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      errors.push(`console.error: ${msg.text()}`);
    }
  });
  page.on("pageerror", (err) => {
    const detail = err && err.message ? err.message : String(err);
    errors.push(`pageerror: ${detail}`);
  });
  return {
    getErrors: () => [...errors],
    assertNoErrors: () => {
      if (errors.length > 0) {
        throw new Error(`Uncaught browser errors detected:\n${errors.join("\n")}`);
      }
    },
  };
}

export default {
  testDir: "./tests",
  timeout: 15000,
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    headless: true,
    offline: true,
    viewport: { width: 1280, height: 720 },
    actionTimeout: 5000,
  },
};
