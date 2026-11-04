-- Runs once, when the dev MySQL volume is first created (as root).
-- MYSQL_DATABASE/MYSQL_USER already created `jali` and the `jali` user. The e2e tests
-- need a second, separate database, because they empty every table on each run.
CREATE DATABASE IF NOT EXISTS `jali_test` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON `jali_test`.* TO 'jali'@'%';
FLUSH PRIVILEGES;
