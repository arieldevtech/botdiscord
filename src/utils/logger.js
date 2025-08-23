const chalk = require("chalk");

function ts() {
  return new Date().toISOString();
}

const logger = {
  info: (...args) => console.log(chalk.cyan(`[${ts()}] [INFO ]`), ...args),
  warn: (...args) => console.warn(chalk.yellow(`[${ts()}] [WARN ]`), ...args),
  error: (...args) => console.error(chalk.red(`[${ts()}] [ERROR]`), ...args),
  success: (...args) => console.log(chalk.green(`[${ts()}] [ OK  ]`), ...args),
  debug: (...args) => {
    if (process.env.NODE_ENV !== "production") {
      console.log(chalk.magenta(`[${ts()}] [DEBUG]`), ...args);
    }
  },
};

module.exports = logger;