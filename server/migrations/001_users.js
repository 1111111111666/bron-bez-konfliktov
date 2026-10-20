export const shorthands = undefined;

export async function up(pgm) {
  pgm.createTable('users', {
    id: { type: 'serial', primaryKey: true },
    name: { type: 'varchar(100)', notNull: true },
    login: { type: 'varchar(50)', notNull: true, unique: true },
    password_hash: { type: 'varchar(255)', notNull: true },
    role: {
      type: 'varchar(20)',
      notNull: true,
      check: "role IN ('user', 'admin')",
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });
}

export async function down(pgm) {
  pgm.dropTable('users');
}