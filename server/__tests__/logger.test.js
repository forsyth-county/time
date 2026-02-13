const logger = require("../utils/logger");

describe("logger", () => {
  it("exports a winston logger with info method", () => {
    expect(typeof logger.info).toBe("function");
  });

  it("exports a winston logger with error method", () => {
    expect(typeof logger.error).toBe("function");
  });

  it("exports a winston logger with warn method", () => {
    expect(typeof logger.warn).toBe("function");
  });

  it("does not throw when logging", () => {
    expect(() => logger.info("test message")).not.toThrow();
    expect(() => logger.warn("test warning", { key: "val" })).not.toThrow();
    expect(() => logger.error("test error", { error: "oops" })).not.toThrow();
  });
});
