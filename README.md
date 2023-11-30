# PromiseLadder

`PromiseLadder` is a JavaScript library designed for efficient and intelligent management of asynchronous promise resolution in batch processes. It uniquely addresses scenarios where the same resource is repeatedly requested before the completion of its processing through an escalation ladder, ensuring singleton resolution of such resources. This makes it ideal for environments where timely and optimized handling of resource requests is critical.

## Features

- **Singleton Resource Resolution**: Unique handling of repeated resource requests, ensuring that each resource is processed only once through the escalation ladder.
- **Batch Processing**: Efficiently groups promises into batches for optimized processing.
- **Escalation Levels**: Dynamically escalates unresolved promises to different levels based on custom rules.
- **Configurable Options**: Tailor the batch sizes, concurrency limits, and timeout settings to suit specific requirements.
- **Comprehensive Promise Management**: Seamlessly handles promise resolution, rejection, and escalation.

## Installation

To install PromiseLadder via npm:

```bash
npm install promise-ladder
```
## Usage

Begin by importing PromiseLadder and defining your escalation stacks:

```javascript
import PromiseLadder from 'promise-ladder';
import _ from "lodash";

// Define your escalation stacks
const stacks = [
  {
    resolver: async (sources) => { /* ... */ },
    callback: (item) => { /* ... */ },
    options: {
      minBatchSize: 5,
      maxConcurrentBatches: 2,
      timeout: 1000
    }
  },
  // Add more levels as needed
];

// Initialize the PromiseLadder
const ladder = new PromiseLadder(stacks);

// Process sources using the ladder
ladder.resolve('some-source').then(/* ... */);
```

## API Reference

### `PromiseLadder(stacks)`

- `stacks`: An array of `Escalation` objects defining the levels in the PromiseLadder.

### `resolve(source)`

- `source`: A string identifier for the resource to be processed.

Returns a promise which resolves or rejects based on the processing defined in the escalation stacks.

### `Escalation` Object

Defines a level in the PromiseLadder, with properties:

- `resolver`: A function for processing a batch of sources.
- `callback`: A function invoked for each resolved item.
- `options`: Configuration options including `minBatchSize`, `maxConcurrentBatches`, and `timeout`.

## Contributing

Contributions are welcome! Please refer to our [Contributing Guide](CONTRIBUTING.md) for information on the contribution process and code of conduct.

## License

This project is licensed under the [MIT License](LICENSE).
