# SA Dispatcher CORE

**_Warning!_** This project is a work in progress and apis are subject to change.

SA Dispatcher is a collection of TypeScript tools designed to automate gameplay in [Star Atlas](https://staratlas.com/) - SAGE / HOLOSIM Labs.

For more details on Star Atlas, visit [https://play.staratlas.com]().

## cmd-center

A TypeScript app that uses the `@staratlas/sage` package.
 
### Features

```
- [x] a fleet can start/stop mining
- [x] a fleet can dock/undock from Starbase
- [x] a fleet can withdraw/unload cargo (deposit to Starbase)
- [x] a fleet can deposit/reload cargo supplies (withdraw from Starbase)
- [x] a fleet can move as warp to sector coordinates
- [x] a fleet can move as subwarp to sector coordinates
- [x] a fleet can survey sector scan for SDU
- [x] a fleet processs with chain of actions for a fleet
-       [x] process execution flow
-       [/] process builder
- [x] dispatcher to manage processs
-       [x] oserve/event menagement of actions
-       [/] actions queue
-       [/] error handling of evenets
 .... And many more Scan And Combat Flows, builder for traansport and minig tasks
```

### Example of Usage

YouTUBE - https://www.youtube.com/@SA-Dispatcher
Discord - https://discord.gg/RFZsNV2KRU

#### Tests

See `cmd-center/tests` folder for more detailed examples.

- `solana.test.rs`
- `solana.tx.test.rs`

See `cmd-center/scripts` folder for simple instructions, and pre defined process examples.

- Mine Asteroids - `mining.ts`
- Move to Coordinates - `movement.ts`
- Mine Process - `mine-on-css.ts`
- Mine with move to UST-4 and deposit on CSS - `move-and-mine.ts`
- ... and more

#### Server

First configure the `labs-cmd-center/.env` file.

```
cd sa-dispatcher-core/
cp .env.sample .env
bun run cmd-center --fleetName=f1

bun run scripts/<script_name>.ts
```

See [thunder-collection_labs-cmd-center-api.json](docs/thunder-collection_labs-cmd-center-api.json) for more details.

### Developer Notes

#### Bun

- https://bun.sh/
- https://youtu.be/U4JVw8K19uY

#### Windows

```
wsl --help
wsl --list
wsl -d Ubuntu -u <UserName> --system
```

#### Ubuntu

```
su - <username>
```

- Inspired by [Lab-Assistant](https://github.com/ImGroovin/Lab-Assistant).
- To all those have graciously helped from `#community-devlopers` channel on Star Atlas Discord.


### Donations Note !!!

If you find our tools useful, please consider donating to support continued and future development:

>       DV6mRBZJnQcV5GT9A5gcREu17zJM8g27915gL1pWqsSU

```
NOTE!!! There is automatic donation enabled per transaction in SAGE mode !!! 

To stop it, set property to false in your script.

// On dispatcher instance
let dispatcher = new Dispatcher.build({ useLookuptables: true});
dispatcher.donate = false;

// Or on Process instance 
let pro = await FleetProcess.build();
process.dispatcher = false;

// To manage donation base Size 
Dispatcher.baseDonation = 5000; // 0.000005 Sol

``` 