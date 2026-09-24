// Central registry of IPC channel names, shared by main and preload.

export const IPC = {
  accounts: {
    list: 'accounts:list',
    add: 'accounts:add',
    remove: 'accounts:remove',
    rename: 'accounts:rename',
    refresh: 'accounts:refresh'
  },
  discord: {
    getGuilds: 'discord:getGuilds',
    getChannels: 'discord:getChannels',
    getThreads: 'discord:getThreads',
    getDMs: 'discord:getDMs',
    getRoles: 'discord:getRoles'
  },
  exporter: {
    start: 'exporter:start',
    cancel: 'exporter:cancel'
  },
  dialog: {
    pickOutputFolder: 'dialog:pickOutputFolder',
    openPath: 'dialog:openPath'
  },
  events: {
    log: 'events:log',
    progress: 'events:progress'
  }
} as const
