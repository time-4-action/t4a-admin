// lib/mongodb.ts
import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI!;

declare global {
  // eslint-disable-next-line no-var
  var _mongooseConn: typeof mongoose | null;
}

export async function connectDB() {
  if (global._mongooseConn) return global._mongooseConn;
  global._mongooseConn = await mongoose.connect(MONGODB_URI);
  return global._mongooseConn;
}
