// Spin up an in-memory MongoDB for integration tests and connect mongoose to it.
// `lib/mongodb.ts` caches connections on global._mongooseConn; tests bypass that by
// connecting mongoose directly (the models attach to the default connection).
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import "@/lib/mongodb"; // declares the global used by connectDB()

let server: MongoMemoryServer | null = null;

export async function startMongo(): Promise<void> {
  server = await MongoMemoryServer.create();
  const conn = await mongoose.connect(server.getUri(), { dbName: "t4a-test" });
  // lib/mongodb.ts connectDB() short-circuits on this global.
  global._mongooseConn = conn;
  // Make sure unique indexes exist before the race tests run.
  for (const name of mongoose.modelNames()) {
    await mongoose.model(name).syncIndexes();
  }
}

export async function stopMongo(): Promise<void> {
  global._mongooseConn = null;
  await mongoose.disconnect();
  await server?.stop();
  server = null;
}

export async function clearMongo(): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) return;
  const collections = await db.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
}
