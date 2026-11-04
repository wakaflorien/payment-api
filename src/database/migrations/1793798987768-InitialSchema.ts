import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial schema, generated from the entities with `pnpm migration:generate` and then
 * made database-name independent (the generated column's typeorm_metadata row uses the
 * current database instead of the one it was generated against).
 *
 * Production runs migrations (DB_SYNCHRONIZE=false). Never edit an applied migration;
 * add a new one.
 */
export class InitialSchema1793798987768 implements MigrationInterface {
  name = 'InitialSchema1793798987768';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const database = await queryRunner.getCurrentDatabase();
    await queryRunner.query(
      `CREATE TABLE \`users\` (\`id\` int NOT NULL AUTO_INCREMENT, \`email\` varchar(255) NOT NULL, \`password_hash\` varchar(255) NOT NULL, \`role\` varchar(30) NOT NULL DEFAULT 'loan_officer', \`is_active\` tinyint NOT NULL DEFAULT 1, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_ace513fa30d485cfd25c11a9e4\` (\`role\`), UNIQUE INDEX \`IDX_97672ac88f789774dd47f7c8be\` (\`email\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`customers\` (\`id\` int NOT NULL AUTO_INCREMENT, \`full_name\` varchar(255) NOT NULL, \`phone\` varchar(10) NOT NULL, \`national_id\` char(16) NOT NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_88acd889fbe17d0e16cc4bc917\` (\`phone\`), UNIQUE INDEX \`IDX_81cef023276a6e88202edaae64\` (\`national_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`payments\` (\`id\` int NOT NULL AUTO_INCREMENT, \`loan_id\` int NOT NULL, \`provider\` varchar(20) NOT NULL, \`transaction_id\` varchar(100) NOT NULL, \`amount\` int UNSIGNED NOT NULL, \`applied_amount\` int UNSIGNED NOT NULL DEFAULT '0', \`unapplied_amount\` int UNSIGNED NOT NULL DEFAULT '0', \`currency\` char(3) NOT NULL DEFAULT 'RWF', \`status\` varchar(10) NOT NULL DEFAULT 'PENDING', \`payer_phone\` varchar(15) NULL, \`failure_reason\` varchar(255) NULL, \`provider_timestamp\` datetime NULL, \`completed_at\` datetime NULL, \`reconcile_attempts\` smallint UNSIGNED NOT NULL DEFAULT '0', \`next_reconcile_at\` datetime NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`idx_payments_reconcile\` (\`status\`, \`next_reconcile_at\`), INDEX \`idx_payments_loan_status\` (\`loan_id\`, \`status\`), UNIQUE INDEX \`uq_payments_provider_transaction\` (\`provider\`, \`transaction_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`loans\` (\`id\` int NOT NULL AUTO_INCREMENT, \`customer_id\` int NOT NULL, \`principal\` int UNSIGNED NOT NULL, \`interest_rate\` decimal(5,2) NOT NULL, \`interest_amount\` int UNSIGNED NOT NULL, \`total_due\` int UNSIGNED NOT NULL, \`outstanding\` int UNSIGNED NOT NULL, \`term_months\` tinyint UNSIGNED NOT NULL, \`status\` varchar(20) NOT NULL DEFAULT 'active', \`active_customer_id\` int AS (IF(\`status\` = 'active', \`customer_id\`, NULL)) STORED NULL, \`disbursed_at\` date NOT NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_a630540e1bb9644436a2258c3d\` (\`status\`), UNIQUE INDEX \`uq_loans_one_active_per_customer\` (\`active_customer_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `INSERT INTO \`typeorm_metadata\`(\`database\`, \`schema\`, \`table\`, \`type\`, \`name\`, \`value\`) VALUES (DEFAULT, ?, ?, ?, ?, ?)`,
      [
        database,
        'loans',
        'GENERATED_COLUMN',
        'active_customer_id',
        "IF(`status` = 'active', `customer_id`, NULL)",
      ],
    );
    await queryRunner.query(
      `CREATE TABLE \`installments\` (\`id\` int NOT NULL AUTO_INCREMENT, \`loan_id\` int NOT NULL, \`number\` tinyint UNSIGNED NOT NULL, \`due_date\` date NOT NULL, \`amount\` int UNSIGNED NOT NULL, UNIQUE INDEX \`IDX_9fab5fa6fbad313b12cab4bbfe\` (\`loan_id\`, \`number\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`payment_callbacks\` (\`id\` int NOT NULL AUTO_INCREMENT, \`provider\` varchar(20) NOT NULL, \`transaction_id\` varchar(100) NOT NULL, \`reported_status\` varchar(10) NOT NULL, \`outcome\` varchar(20) NOT NULL, \`http_status\` smallint UNSIGNED NOT NULL, \`payment_id\` int NULL, \`detail\` varchar(255) NULL, \`request_id\` varchar(64) NULL, \`payload\` json NOT NULL, \`received_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`idx_payment_callbacks_transaction\` (\`provider\`, \`transaction_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`payments\` ADD CONSTRAINT \`FK_a150bed3d0ff42298b5044c4021\` FOREIGN KEY (\`loan_id\`) REFERENCES \`loans\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`loans\` ADD CONSTRAINT \`FK_407d3207500ffa10289f908f0ef\` FOREIGN KEY (\`customer_id\`) REFERENCES \`customers\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`installments\` ADD CONSTRAINT \`FK_6a0de085bb82a1e96164dc1b900\` FOREIGN KEY (\`loan_id\`) REFERENCES \`loans\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const database = await queryRunner.getCurrentDatabase();
    await queryRunner.query(
      `ALTER TABLE \`installments\` DROP FOREIGN KEY \`FK_6a0de085bb82a1e96164dc1b900\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`loans\` DROP FOREIGN KEY \`FK_407d3207500ffa10289f908f0ef\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`payments\` DROP FOREIGN KEY \`FK_a150bed3d0ff42298b5044c4021\``,
    );
    await queryRunner.query(
      `DROP INDEX \`idx_payment_callbacks_transaction\` ON \`payment_callbacks\``,
    );
    await queryRunner.query(`DROP TABLE \`payment_callbacks\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_9fab5fa6fbad313b12cab4bbfe\` ON \`installments\``,
    );
    await queryRunner.query(`DROP TABLE \`installments\``);
    await queryRunner.query(
      `DELETE FROM \`typeorm_metadata\` WHERE \`type\` = ? AND \`name\` = ? AND \`schema\` = ? AND \`table\` = ?`,
      ['GENERATED_COLUMN', 'active_customer_id', database, 'loans'],
    );
    await queryRunner.query(
      `DROP INDEX \`uq_loans_one_active_per_customer\` ON \`loans\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_a630540e1bb9644436a2258c3d\` ON \`loans\``,
    );
    await queryRunner.query(`DROP TABLE \`loans\``);
    await queryRunner.query(
      `DROP INDEX \`uq_payments_provider_transaction\` ON \`payments\``,
    );
    await queryRunner.query(
      `DROP INDEX \`idx_payments_loan_status\` ON \`payments\``,
    );
    await queryRunner.query(
      `DROP INDEX \`idx_payments_reconcile\` ON \`payments\``,
    );
    await queryRunner.query(`DROP TABLE \`payments\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_81cef023276a6e88202edaae64\` ON \`customers\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_88acd889fbe17d0e16cc4bc917\` ON \`customers\``,
    );
    await queryRunner.query(`DROP TABLE \`customers\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_97672ac88f789774dd47f7c8be\` ON \`users\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_ace513fa30d485cfd25c11a9e4\` ON \`users\``,
    );
    await queryRunner.query(`DROP TABLE \`users\``);
  }
}
