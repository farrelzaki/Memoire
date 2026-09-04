import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { referencedPropertyIds, type FormulaAst } from '@memoire/formula';
import type { FormulaConfig, RollupConfig } from '@memoire/validation';
import { DRIZZLE_DB, DrizzleDB } from '../db/drizzle.provider';
import { databaseProperties } from '../db/schema';

interface Graph {
  /** propertyId → ids of the properties it directly reads (§24A.4). */
  dependsOn: Map<string, string[]>;
  names: Map<string, string>;
}

/**
 * The formula/rollup dependency graph for a database (§24A.4) — an
 * in-memory `Map`, rebuilt on first access after invalidation. Single
 * process, single user: no cross-process cache invalidation protocol needed
 * beyond "call `invalidate` after any property write."
 */
@Injectable()
export class FormulaGraphService {
  private readonly cache = new Map<string, Graph>();

  constructor(@Inject(DRIZZLE_DB) private readonly db: DrizzleDB) {}

  invalidate(databaseId: string): void {
    this.cache.delete(databaseId);
  }

  async getGraph(databaseId: string): Promise<Graph> {
    const cached = this.cache.get(databaseId);
    if (cached) return cached;

    const properties = await this.db
      .select()
      .from(databaseProperties)
      .where(eq(databaseProperties.databaseId, databaseId));

    const dependsOn = new Map<string, string[]>();
    const names = new Map<string, string>();
    for (const p of properties) {
      names.set(p.id, p.name);
      if (p.type === 'formula') {
        const config = p.config as FormulaConfig | null;
        dependsOn.set(p.id, config?.ast ? referencedPropertyIds(config.ast as FormulaAst) : []);
      } else if (p.type === 'rollup') {
        const config = p.config as RollupConfig | null;
        dependsOn.set(p.id, [config?.relationPropertyId, config?.targetPropertyId].filter((id): id is string => !!id));
      }
    }

    const graph: Graph = { dependsOn, names };
    this.cache.set(databaseId, graph);
    return graph;
  }

  /**
   * DFS white/gray/black cycle detection (§24A.4), evaluated with
   * `propertyId`'s edges hypothetically set to `dependsOn` — lets a
   * not-yet-saved create/update be checked before it's committed. Returns
   * the cycle as property **names** (`['Status', 'Priority', 'Status']`) for
   * a readable 400, or `null` if the graph (with this edge) is acyclic.
   */
  async detectCycle(
    databaseId: string,
    propertyId: string,
    dependsOn: string[],
    propertyName: string,
  ): Promise<string[] | null> {
    const graph = await this.getGraph(databaseId);
    const edges = new Map(graph.dependsOn);
    edges.set(propertyId, dependsOn);
    const names = new Map(graph.names);
    names.set(propertyId, propertyName);

    const color = new Map<string, 0 | 1 | 2>();
    const stack: string[] = [];

    const dfs = (node: string): string[] | null => {
      color.set(node, 1);
      stack.push(node);
      for (const dep of edges.get(node) ?? []) {
        const depColor = color.get(dep) ?? 0;
        if (depColor === 1) {
          const idx = stack.indexOf(dep);
          return [...stack.slice(idx), dep];
        }
        if (depColor === 0) {
          const found = dfs(dep);
          if (found) return found;
        }
      }
      stack.pop();
      color.set(node, 2);
      return null;
    };

    for (const node of edges.keys()) {
      if ((color.get(node) ?? 0) === 0) {
        const cycle = dfs(node);
        if (cycle) return cycle.map((id) => names.get(id) ?? id);
      }
    }
    return null;
  }

  /** Formula property ids that directly read `propertyId` — recomputed when it changes (§24A.5 case 1). */
  async dependentsOf(databaseId: string, propertyId: string): Promise<string[]> {
    const graph = await this.getGraph(databaseId);
    return [...graph.dependsOn.entries()].filter(([, deps]) => deps.includes(propertyId)).map(([id]) => id);
  }

  /**
   * Formula/rollup property ids in dependency order (a formula that reads
   * another formula's result comes after it) — Kahn's algorithm. A
   * dependency that isn't itself a formula/rollup (a raw value property) is
   * already "resolved", so it contributes no ordering edge. The graph is
   * guaranteed acyclic here — every write path calls `detectCycle` first.
   */
  async topoOrder(databaseId: string): Promise<string[]> {
    const graph = await this.getGraph(databaseId);
    const nodes = [...graph.dependsOn.keys()];
    const nodeSet = new Set(nodes);
    const inDegree = new Map<string, number>(nodes.map((n) => [n, 0]));
    const dependents = new Map<string, string[]>(nodes.map((n) => [n, []]));

    for (const [node, deps] of graph.dependsOn) {
      for (const dep of deps) {
        if (!nodeSet.has(dep)) continue; // raw value property — no ordering edge
        inDegree.set(node, (inDegree.get(node) ?? 0) + 1);
        dependents.get(dep)!.push(node);
      }
    }

    const queue = nodes.filter((n) => (inDegree.get(n) ?? 0) === 0);
    const order: string[] = [];
    while (queue.length > 0) {
      const node = queue.shift()!;
      order.push(node);
      for (const dependent of dependents.get(node) ?? []) {
        const next = (inDegree.get(dependent) ?? 0) - 1;
        inDegree.set(dependent, next);
        if (next === 0) queue.push(dependent);
      }
    }

    return order;
  }
}
