export const shorthands = undefined;

export async function up(pgm) {
  pgm.createTable('audit_events', {
    id: { type: 'bigserial', primaryKey: true },
    occurred_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
    actor_id: {
      type: 'integer',
      references: 'users',
      onDelete: 'SET NULL',
    },
    action: { type: 'varchar(50)', notNull: true },
    object_type: { type: 'varchar(50)', notNull: true },
    object_id: { type: 'integer' },
    result: { type: 'varchar(20)', notNull: true },
    trace_id: { type: 'varchar(50)' },
  });

  // для фильтра «последние события» в админке
  pgm.createIndex('audit_events', ['occurred_at']);
}

export async function down(pgm) {
  pgm.dropTable('audit_events');
}