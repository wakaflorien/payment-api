#!/bin/bash
# Runs once, when the MySQL volume is first initialised.
#
# Least privilege: the image creates MYSQL_USER (jali_migrator), which owns the schema
# and is used only by the one-off migrate job and backups. The API connects as
# jali_app, which can read and write rows but cannot create, alter or drop anything.
set -euo pipefail

app_password="$(cat /run/secrets/db_app_password)"

mysql --protocol=socket -uroot -p"${MYSQL_ROOT_PASSWORD}" <<SQL
CREATE USER IF NOT EXISTS 'jali_app'@'%' IDENTIFIED BY '${app_password}';
GRANT SELECT, INSERT, UPDATE, DELETE ON \`${MYSQL_DATABASE}\`.* TO 'jali_app'@'%';
FLUSH PRIVILEGES;
SQL
