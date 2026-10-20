export const shorthands = undefined;

export async function up(pgm) {
  pgm.createTable('resources', {
    id: { type: 'serial', primaryKey: true },
    name: { type: 'varchar(100)', notNull: true },
    description: { type: 'varchar(500)' },
    location: { type: 'varchar(100)', notNull: true },
    is_active: { type: 'boolean', notNull: true, default: true },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  // индекс для поиска по локации (фильтр в каталоге)
  pgm.createIndex('resources', 'location');
}

export async function down(pgm) {
  pgm.dropTable('resources');
}