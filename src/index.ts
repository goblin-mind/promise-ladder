import _ from "lodash";
import { LRUCache } from "lru-cache";

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
  private currentBatches: number[];
  //private purgeTrack: LRUCache<string, Product>;

  constructor(stacks: Escalation[]) {
    this.levels = stacks;
    this.sourceProms = new Map();
    this.processingStacks = stacks.map(() => []);
   /* this.purgeTrack = new LRUCache({
      max: 500,
      dispose: (value: Product, key: string) => {
        this.sourceProms.delete(key);
        console.log("removing least recently accessed unresolved promise", key);
        //TODO should it resolve?
      },
    });*/
    this.batchTimers = stacks.map((st, stackIndex) =>
      setInterval(() => {
        this.processBatch(stackIndex);
      }, this.levels[stackIndex].options.timeout)
    );
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

    this.processingStacks[stackIndex].push({ source, resolve, reject });

    //lru to actively trim the stack
   // this.purgeTrack.set(source, { source, resource: undefined });
  }

  private async processBatch(stackIndex: number): Promise<void> {
    const stackOptions = this.levels[stackIndex].options;
    if (
      this.currentBatches[stackIndex] > stackOptions.maxConcurrentBatches &&
      this.processingStacks[stackIndex].length >= stackOptions.minBatchSize
    ) {
      return;
    }
    this.processingStacks[stackIndex] = this.processingStacks[
      stackIndex
    ].filter((stackItem: SourceItem) => this.sourceProms.has(stackItem.source));
    const sources: SourceItem[] = _.takeRight(
      this.processingStacks[stackIndex],
      stackOptions.minBatchSize
    );
    this.processingStacks[stackIndex] = _.dropRight(
      this.processingStacks[stackIndex],
      stackOptions.minBatchSize
    );

    /*if (this.batchTimers[stackIndex]) {
      clearTimeout(this.batchTimers[stackIndex]);
      this.batchTimers[stackIndex] = null;
    }*/

    this.processSources(sources, stackIndex);
  }

  /*private dispose(product:Product,key:string){
    const rQMap = _.keyBy(qItems, "source");
    const { source, resolve, reject } = rQMap[product.source];
    const stackIndex = _.findIndex(this.processingStacks,(processingStack)=>processingStack.find((sourceItem)=>sourceItem.source===product.source)?true:false)
    this.sourceProms.delete(source);
    this.levels[stackIndex].callback(product);
    resolve(product.resource);
  }*/

  private async processSources(
    qItems: SourceItem[],
    stackIndex: number
  ): Promise<void> {
    this.currentBatches[stackIndex]++;
    const rQMap = _.keyBy(qItems, "source");
    const escalate = (sources: string[]) => {
      for (const source of sources) {
        const { resolve, reject } = rQMap[source];
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
      const passed: Product[] = foundProducts["true"] || [];
      escalate(_.map(failed, "source"));

      for (const product of passed) {
        const { source, resolve, reject } = rQMap[product.source];

        this.sourceProms.delete(source);
        this.levels[stackIndex].callback(product);
        //todo delete from this.processingStacks?
        resolve(product.resource);
      }
    } catch (error) {
      escalate(_.map(qItems, "source")); // Escalate to the next stack
    }
    this.currentBatches[stackIndex]--;
  }
}
