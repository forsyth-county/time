// Set JWT_SECRET before requiring auth module
process.env.JWT_SECRET = "test_jwt_secret_for_unit_tests";

const jwt = require("jsonwebtoken");
const { generateToken, JWT_SECRET, authRequired } = require("../middleware/auth");

describe("auth middleware", () => {
  describe("generateToken", () => {
    it("returns a valid JWT string", () => {
      const token = generateToken("abc123");
      expect(typeof token).toBe("string");
      const parts = token.split(".");
      expect(parts).toHaveLength(3);
    });

    it("contains the user id in payload", () => {
      const token = generateToken("user_42");
      const decoded = jwt.verify(token, JWT_SECRET);
      expect(decoded.id).toBe("user_42");
    });

    it("expires in 7 days", () => {
      const token = generateToken("user_42");
      const decoded = jwt.verify(token, JWT_SECRET);
      const diff = decoded.exp - decoded.iat;
      expect(diff).toBe(7 * 24 * 60 * 60);
    });
  });

  describe("authRequired", () => {
    let req, res, next;

    beforeEach(() => {
      req = { headers: {} };
      res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };
      next = jest.fn();
    });

    it("returns 401 if no Authorization header", async () => {
      await authRequired(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "Authentication required" });
      expect(next).not.toHaveBeenCalled();
    });

    it("returns 401 if Authorization header does not start with Bearer", async () => {
      req.headers.authorization = "Basic abc123";
      await authRequired(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it("returns 401 if token is invalid", async () => {
      req.headers.authorization = "Bearer invalid.token.here";
      await authRequired(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "Invalid or expired token" });
      expect(next).not.toHaveBeenCalled();
    });

    it("returns 401 if token is expired", async () => {
      const token = jwt.sign({ id: "user1" }, JWT_SECRET, { expiresIn: "-1s" });
      req.headers.authorization = `Bearer ${token}`;
      await authRequired(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("JWT_SECRET enforcement", () => {
    it("exports the JWT_SECRET from env", () => {
      expect(JWT_SECRET).toBe("test_jwt_secret_for_unit_tests");
    });
  });
});
