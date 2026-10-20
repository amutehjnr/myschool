'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const path = require('path');
const fs = require('fs');
const mysql = require('mysql2/promise');

async function runSeed() {
  const connection = await mysql.createConnection({
    host: process.env.DATABASE_HOST || '127.0.0.1',
    port: Number(process.env.DATABASE_PORT) || 3306,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    namedPlaceholders: true,
    multipleStatements: false
  });

  async function query(sql, params = {}) {
    const [rows] = await connection.execute(sql, params);
    return rows;
  }

  console.log(`Seeding database: ${process.env.DATABASE_NAME}`);

  const seedersDir = path.join(__dirname, 'seeders');
  const files = fs
    .readdirSync(seedersDir)
    .filter((f) => f.endsWith('.js'))
    .sort();

  for (const file of files) {
    console.log(`\n→ ${file}`);
    const seeder = require(path.join(seedersDir, file));
    if (typeof seeder.seed !== 'function') {
      console.warn(`  Skipped (no seed export)`);
      continue;
    }
    await seeder.seed(query);
  }

  await connection.end();
  console.log('\nSeeding complete.');
  console.log('\nDefault accounts (development only):');
  console.log('  Admin:   admin@psha.edu.ng / ChangeMe@PSHA2026  (must change password)');
  console.log('  Teacher: adebayo.okafor@psha.edu.ng / Password@123');
  console.log('  Student: stu-2025-001@student.psha.edu.ng / Password@123');
  console.log('  Parent:  parent.nwosu@example.com / Password@123');
}

if (require.main === module) {
  runSeed().catch((err) => {
    console.error('Seed failed:', err.message);
    process.exit(1);
  });
}

module.exports = { runSeed };
