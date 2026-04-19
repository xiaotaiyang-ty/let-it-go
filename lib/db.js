/**
 * MongoDB 数据库连接模块
 * 使用连接池复用，适配 Vercel Serverless
 */

const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI;
const options = {};

let client;
let clientPromise;

if (!uri) {
  throw new Error('请配置 MONGODB_URI 环境变量');
}

if (process.env.NODE_ENV === 'development') {
  // 开发环境：使用全局变量保持连接
  if (!global._mongoClientPromise) {
    client = new MongoClient(uri, options);
    global._mongoClientPromise = client.connect();
  }
  clientPromise = global._mongoClientPromise;
} else {
  // 生产环境：每次创建新连接（Vercel 会复用）
  client = new MongoClient(uri, options);
  clientPromise = client.connect();
}

/**
 * 获取数据库实例
 */
async function getDb() {
  const client = await clientPromise;
  return client.db('buneihao');
}

/**
 * 获取集合
 */
async function getCollection(name) {
  const db = await getDb();
  return db.collection(name);
}

module.exports = { clientPromise, getDb, getCollection };
