export const shorthands = undefined;

export async function up(pgm) {
  pgm.createTable('bookings', {
    id: { type: 'serial', primaryKey: true },
    resource_id: {
      type: 'integer',
      notNull: true,
      references: 'resources',
      onDelete: 'RESTRICT',
    },
    owner_id: {
      type: 'integer',
      notNull: true,
      references: 'users',
      onDelete: 'RESTRICT',
    },
    start_time: { type: 'timestamptz', notNull: true },
    end_time: { type: 'timestamptz', notNull: true },
    purpose: { type: 'varchar(300)', notNull: true },
    status: {
      type: 'varchar(20)',
      notNull: true,
      default: 'Active',
      check: "status IN ('Active', 'Cancelled')",
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
    cancelled_by: {
      type: 'integer',
      references: 'users',
      onDelete: 'SET NULL',
    },
    cancelled_at: { type: 'timestamptz' },
    cancel_reason: { type: 'varchar(300)' },
  });

  // окончание позже начала — требование методички
  pgm.addConstraint('bookings', 'bookings_end_after_start', {
    check: 'end_time > start_time',
  });

  // длина цели 5–300 — требование методички
  pgm.addConstraint('bookings', 'bookings_purpose_length', {
    check: 'char_length(purpose) BETWEEN 5 AND 300',
  });

  // индекс для проверки пересечений: (ресурс + статус + время)
  pgm.createIndex('bookings', ['resource_id', 'status', 'start_time', 'end_time'], {
    name: 'ix_bookings_resource_time',
  });

  // индекс для «Мои бронирования»
  pgm.createIndex('bookings', ['owner_id', 'start_time'], {
    name: 'ix_bookings_owner',
  });
}

export async function down(pgm) {
  pgm.dropTable('bookings');
}