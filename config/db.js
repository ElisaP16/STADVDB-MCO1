const mysql = require('mysql2');
require('dotenv').config();

const DB_NAME = process.env.DB_NAME || 'star_schema';

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: DB_NAME,
    dateStrings: true
}).promise();

const connectDB = async () => {
    try {
        // The pool targets DB_NAME, which may not exist yet on a fresh install,
        // so create it first over a one-off connection that selects no database.
        const boot = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            port: Number(process.env.DB_PORT) || 3306,
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD
        }).promise();
        await boot.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\``);
        await boot.end();

        const conn = await pool.getConnection();
        console.log('Successfully connected to MySQL database!');
        conn.release();
    } catch (err) {
        console.error('Database connection failed!', err);
        throw err;
    }
};

const createTables = async () => {
    try {
        const createAccountTable = `
            CREATE TABLE IF NOT EXISTS account (
                sys_account_ID INT UNSIGNED NOT NULL AUTO_INCREMENT,
                account_ID     BIGINT UNSIGNED NOT NULL,
                frequency      VARCHAR(30),
                creation_date  DATE,
                PRIMARY KEY (sys_account_ID)
            );
        `;

        const createDistrictTable = `
            CREATE TABLE IF NOT EXISTS district (
                sys_district_id        INT UNSIGNED NOT NULL AUTO_INCREMENT,
                district_id            BIGINT UNSIGNED NOT NULL,
                district_name          VARCHAR(100) NOT NULL,
                average_salary         DECIMAL(15,2),
                inhabitants            INT UNSIGNED,
                unemployment           DECIMAL(5,2),
                ratio_urbaninhabitants DECIMAL(5,2),
                region                 VARCHAR(100),
                PRIMARY KEY (sys_district_id)
            );
        `;

        const createPeriodTable = `
            CREATE TABLE IF NOT EXISTS period (
                period_id     INT UNSIGNED NOT NULL AUTO_INCREMENT,
                complete_date DATE NOT NULL UNIQUE,
                year          SMALLINT UNSIGNED NOT NULL,
                quarter       ENUM('Q1','Q2','Q3','Q4'),
                month         ENUM('January','February','March','April','May','June','July','August','September','October','November','December'),
                day           TINYINT UNSIGNED NOT NULL,
                day_name      ENUM('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'),
                PRIMARY KEY (period_id)
            );
        `;

        const createTypeTable = `
            CREATE TABLE IF NOT EXISTS type (
                type_id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
                action_done      VARCHAR(500),
                transaction_type ENUM('CREDIT','DEBIT'),
                k_symbol         VARCHAR(200),
                PRIMARY KEY (type_id)
            );
        `;

        const createTransTable = `
            CREATE TABLE IF NOT EXISTS trans (
                sys_account_ID      INT UNSIGNED NOT NULL,
                sys_district_id     INT UNSIGNED NOT NULL,
                period_id           INT UNSIGNED NOT NULL,
                type_id             INT UNSIGNED NOT NULL,
                num_of_transactions INT UNSIGNED NOT NULL,
                total_trans_amount  DECIMAL(15,2) NOT NULL,

                PRIMARY KEY (sys_account_ID, sys_district_id, period_id, type_id),
                FOREIGN KEY (sys_account_ID)  REFERENCES account  (sys_account_ID),
                FOREIGN KEY (sys_district_id) REFERENCES district (sys_district_id),
                FOREIGN KEY (period_id)       REFERENCES period   (period_id),
                FOREIGN KEY (type_id)         REFERENCES type     (type_id)
            );
        `;

        // Dimensions first, fact table last (it holds the foreign keys)
        await pool.query(createAccountTable);
        console.log('Successfully created account table!');

        await pool.query(createDistrictTable);
        console.log('Successfully created district table!');

        await pool.query(createPeriodTable);
        console.log('Successfully created period table!');

        await pool.query(createTypeTable);
        console.log('Successfully created type table!');

        await pool.query(createTransTable);
        console.log('Successfully created trans table!');
    } catch (err) {
        console.error('Failed to create the database tables', err);
        throw err;
    }
};

module.exports = {
    pool,
    connectDB,
    createTables
};
