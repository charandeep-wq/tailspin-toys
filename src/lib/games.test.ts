import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDatabase } from '../../db/test-helpers';
import { categories, publishers, games } from '../../db/schema';
import type { Database } from './db';
import {
    getAllGames,
    getAllCategories,
    getAllPublishers,
    getAllGameIds,
    getGameById,
    getGames,
} from './games';

async function seedGames(db: Database, count: number): Promise<void> {
    const [category] = await db
        .insert(categories)
        .values({ name: 'Strategy', description: 'cat' })
        .returning({ id: categories.id });
    const [publisher] = await db
        .insert(publishers)
        .values({ name: 'Pub One', description: 'pub' })
        .returning({ id: publishers.id });

    // Insert titles in reverse-alphabetical order to prove ordering is applied.
    for (let i = count; i >= 1; i--) {
        await db.insert(games).values({
            title: `Game ${String(i).padStart(2, '0')}`,
            description: `Description ${i}`,
            starRating: 4.2,
            categoryId: category.id,
            publisherId: publisher.id,
        });
    }

}

async function seedFilterFixtures(db: Database): Promise<{
    categories: { strategy: number; puzzle: number };
    publishers: { first: number; second: number };
}> {
    const [strategy, puzzle] = await db
        .insert(categories)
        .values([
            { name: 'Strategy', description: 'strategy' },
            { name: 'Puzzle', description: 'puzzle' },
        ])
        .returning({ id: categories.id, name: categories.name });
    const [first, second] = await db
        .insert(publishers)
        .values([
            { name: 'First Publisher', description: 'first' },
            { name: 'Second Publisher', description: 'second' },
        ])
        .returning({ id: publishers.id, name: publishers.name });

    await db.insert(games).values([
        { title: 'Alpha', description: 'alpha', starRating: 4, categoryId: strategy.id, publisherId: first.id },
        { title: 'Beta', description: 'beta', starRating: 4, categoryId: puzzle.id, publisherId: first.id },
        { title: 'Gamma', description: 'gamma', starRating: 4, categoryId: strategy.id, publisherId: second.id },
    ]);

    return {
        categories: { strategy: strategy.id, puzzle: puzzle.id },
        publishers: { first: first.id, second: second.id },
    };
}

describe('games data-access helpers', () => {
    let db: Database;

    beforeEach(async () => {
        db = await createTestDatabase();
    });

    it('returns all games ordered by title', async () => {
        await seedGames(db, 3);
        const all = await getAllGames(db);
        expect(all.map((g) => g.title)).toEqual(['Game 01', 'Game 02', 'Game 03']);
        expect(all[0].category).toEqual({ id: expect.any(Number), name: 'Strategy' });
        expect(all[0].publisher).toEqual({ id: expect.any(Number), name: 'Pub One' });
    });

    it('returns all game ids ordered by title', async () => {
        await seedGames(db, 3);
        const ids = await getAllGameIds(db);
        const all = await getAllGames(db);
        expect(ids).toEqual(all.map((g) => g.id));
    });

    it('fetches a single game by id', async () => {
        await seedGames(db, 2);
        const ids = await getAllGameIds(db);
        const game = await getGameById(db, ids[0]);
        expect(game?.title).toBe('Game 01');
    });

    it('returns null for a non-existent game', async () => {
        await seedGames(db, 2);
        expect(await getGameById(db, 99999)).toBeNull();
    });

    it('filters games by any selected category', async () => {
        const fixture = await seedFilterFixtures(db);

        const filtered = await getGames(db, { categoryIds: [fixture.categories.strategy, fixture.categories.puzzle] });

        expect(filtered.map((game) => game.title)).toEqual(['Alpha', 'Beta', 'Gamma']);
    });

    it('combines category and publisher filters', async () => {
        const fixture = await seedFilterFixtures(db);

        const filtered = await getGames(db, {
            categoryIds: [fixture.categories.strategy],
            publisherId: fixture.publishers.second,
        });

        expect(filtered.map((game) => game.title)).toEqual(['Gamma']);
    });

    it('returns no games when filters do not match', async () => {
        const fixture = await seedFilterFixtures(db);

        const filtered = await getGames(db, { publisherId: fixture.publishers.second + 100 });

        expect(filtered).toEqual([]);
    });

    it('returns filter options ordered by name', async () => {
        await seedFilterFixtures(db);

        expect((await getAllCategories(db)).map((category) => category.name)).toEqual(['Puzzle', 'Strategy']);
        expect((await getAllPublishers(db)).map((publisher) => publisher.name)).toEqual([
            'First Publisher',
            'Second Publisher',
        ]);
    });
});
