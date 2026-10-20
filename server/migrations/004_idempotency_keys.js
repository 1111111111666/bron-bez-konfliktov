export const shorthands = undefined;

export async function up(pgm) {
  pgm.createTable('idempotency_keys', {
    id: { type: 'serial', primaryKey: true },
    user_id: {
      type: 'integer',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE',
    },
    key: { type: 'varchar(100)', notNull: true },
    request_hash: { type: 'varchar(64)', notNull: true },
    booking_id: {
      type: 'integer',
      references: 'bookings',
      onDelete: 'SET NULL',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  // уникальность ключа в пределах пользователя — требование методички
  pgm.addConstraint('idempotency_keys', 'uq_idempotency_user_key', {
    unique: ['user_id', 'key'],
  });
}

export async function down(pgm) {
  pgm.dropTable('idempotency_keys');
}