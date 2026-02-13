const {
  registerValidation,
  loginValidation,
  createRoomValidation,
} = require("../middleware/validate");

// Helper to run express-validator middleware chain
async function runValidation(validators, body) {
  const req = { body, headers: {}, query: {}, params: {} };
  let statusCalled = false;
  const res = {
    status: jest.fn().mockImplementation(function () {
      statusCalled = true;
      return this;
    }),
    json: jest.fn().mockReturnThis(),
  };
  const next = jest.fn();

  for (const validator of validators) {
    if (statusCalled) break;
    await validator(req, res, next);
  }

  return { req, res, next, statusCalled };
}

describe("registerValidation", () => {
  it("passes with valid input", async () => {
    const { res } = await runValidation(registerValidation, {
      email: "test@example.com",
      username: "testuser",
      password: "password123",
    });
    // handleValidationErrors should not set status
    expect(res.status).not.toHaveBeenCalled();
  });

  it("fails with invalid email", async () => {
    const { res } = await runValidation(registerValidation, {
      email: "not-an-email",
      username: "testuser",
      password: "password123",
    });
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("fails with short username", async () => {
    const { res } = await runValidation(registerValidation, {
      email: "test@example.com",
      username: "ab",
      password: "password123",
    });
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("fails with long username (>20 chars)", async () => {
    const { res } = await runValidation(registerValidation, {
      email: "test@example.com",
      username: "a".repeat(21),
      password: "password123",
    });
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("fails with short password (<6 chars)", async () => {
    const { res } = await runValidation(registerValidation, {
      email: "test@example.com",
      username: "testuser",
      password: "12345",
    });
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("fails with missing fields", async () => {
    const { res } = await runValidation(registerValidation, {});
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe("loginValidation", () => {
  it("passes with valid input", async () => {
    const { res } = await runValidation(loginValidation, {
      email: "test@example.com",
      password: "password123",
    });
    expect(res.status).not.toHaveBeenCalled();
  });

  it("fails with invalid email", async () => {
    const { res } = await runValidation(loginValidation, {
      email: "bad",
      password: "password123",
    });
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("fails with empty password", async () => {
    const { res } = await runValidation(loginValidation, {
      email: "test@example.com",
      password: "",
    });
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe("createRoomValidation", () => {
  it("passes with valid input", async () => {
    const { res } = await runValidation(createRoomValidation, {
      name: "My Room",
    });
    expect(res.status).not.toHaveBeenCalled();
  });

  it("fails with empty name", async () => {
    const { res } = await runValidation(createRoomValidation, {
      name: "",
    });
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("fails with name over 50 chars", async () => {
    const { res } = await runValidation(createRoomValidation, {
      name: "x".repeat(51),
    });
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("passes with optional boolean fields", async () => {
    const { res } = await runValidation(createRoomValidation, {
      name: "My Room",
      isPrivate: true,
      password: "secret",
      waitingRoomEnabled: false,
    });
    expect(res.status).not.toHaveBeenCalled();
  });
});
