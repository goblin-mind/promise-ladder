import _ from "lodash";

export interface Product {
  source: string;
  resource: any;
}

export interface EscalationOptions {
  minBatchSize: number;
  maxConcurrentBatches: number;
  timeout: number; // in milliseconds
}
export interface Escalation {
  resolver: (source: string[]) => Promise<Product[]>;
  callback: (item: Product) => any;
  options: EscalationOptions;
}

interface SourceItem {
  source: string;
  resolve: Function;
  reject: Function;
}

export class PromiseLadder {
  private levels: Escalation[];
  private sourceProms: Map<string, Promise<any>>;
  private processingStacks: SourceItem[][];
  private batchTimers: any[];
  private currentBatchSizes: number[];
  private currentBatches: number[];

  constructor(stacks: Escalation[]) {
    this.levels = stacks;
    this.sourceProms = new Map();
    this.processingStacks = stacks.map(() => []);
    this.batchTimers = stacks.map(() => null);
    this.currentBatchSizes = stacks.map(() => 0);
    this.currentBatches = stacks.map(() => 0);
  }

  resolve(source: string): Promise<any> | undefined {
    if (!this.sourceProms.has(source)) {
      const promise = new Promise((resolve, reject) => {
        this.addToStack(source, 0, resolve, reject);
      });

      this.sourceProms.set(source, promise);
    }

    return this.sourceProms.get(source);
  }

  private addToStack(
    source: string,
    stackIndex: number,
    resolve: Function,
    reject: Function
  ): void {
    if (stackIndex >= this.levels.length) {
      this.sourceProms.delete(source);
      return reject("All resolvers failed");
    }

    this.processingStacks[stackIndex].push({ source: source, resolve, reject });
    this.currentBatchSizes[stackIndex]++;

    const stackOptions = this.levels[stackIndex].options;

    if (this.currentBatchSizes[stackIndex] >= stackOptions.minBatchSize) {
      this.processBatch(stackIndex);
    } else if (!this.batchTimers[stackIndex]) {
      this.batchTimers[stackIndex] = setTimeout(() => {
        this.processBatch(stackIndex);
      }, stackOptions.timeout);
    }
  }

  private async processBatch(stackIndex: number): Promise<void> {
    const stackOptions = this.levels[stackIndex].options;
    if (this.currentBatches[stackIndex] > stackOptions.maxConcurrentBatches) {
      return;
    }

    const sources: SourceItem[] = _.takeRight(
      this.processingStacks[stackIndex],
      stackOptions.minBatchSize
    );
    this.processingStacks[stackIndex] = _.dropRight(
      this.processingStacks[stackIndex],
      stackOptions.minBatchSize
    );

    this.currentBatchSizes[stackIndex] -= sources.length;

    if (this.batchTimers[stackIndex]) {
      clearTimeout(this.batchTimers[stackIndex]);
      this.batchTimers[stackIndex] = null;
    }

    this.processSources(sources, stackIndex);
  }

  private async processSources(
    qItems: SourceItem[],
    stackIndex: number
  ): Promise<void> {
    this.currentBatches[stackIndex]++;
    const rQMap = _.keyBy(qItems, "source");
    const escalate = (sources: string[]) => {
      for (const source of sources) {
        const {  resolve, reject } = rQMap[source];
        this.addToStack(source, stackIndex + 1, resolve, reject); // Escalate to the next stack
      }
    };
    try {
      const results: Product[] = await this.levels[stackIndex].resolver(
        _.map(qItems, "source")
      );

      const foundProducts = _.groupBy(results, (res: any) =>
        res.resource ? true : false
      );
      const failed: Product[] = foundProducts["false"];
      const passed: Product[] = foundProducts["true"];
      escalate(_.map(failed, "source"));

      for (const product of passed) {
        const { source, resolve, reject } = rQMap[product.source];

        this.sourceProms.delete(source);
        this.levels[stackIndex].callback(product);
        resolve(product.resource);
      }
    } catch (error) {
      escalate(_.map(qItems, "source")); // Escalate to the next stack
    }
    this.currentBatches[stackIndex]--;
  }
}