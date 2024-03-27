require("dotenv").config()
const fs = require("node:fs/promises")
const inq = require("@inquirer/prompts")
const { spawn } = require("node:child_process")
const { homedir, platform } = require("node:os")
const path = require("node:path")

const generateRemoteUrl = (s) => `http://${process.env.REMOTE_TEMPLATE.replace("{{name}}", s)}/_next/static/\${location}/remoteEntry.js`
const generateLocalUrl = (p) => `http://localhost:${p}/_next/static/\${location}/remoteEntry.js`
const routesDir = process.env.ROUTES_DIR;
const os = platform === "win32" ? 'win32' : "posix"
let routes = null;
try {
  routes = require(routesDir)
} catch {
  routes = null;
}


async function init() {
  let dirs = []
  if (!routes)
    dirs = (await fs.readdir(".")).filter((s) => !s.includes(".") && s !== "node_modules" && s !== "app-mfbase")
  else {
    dirs = routes.map(r => homedir().concat(`/${r}`))
  }

  const pull_repos = (await inq.input({
    message: "Do you want to pull repos? (y/n):",
    default: "n"
  })) === "y"

  const install_dependencies = (await inq.input({
    message: "Do you want to install dependencies? (y/n):",
    default: "n"
  })) === "y"

  const start_apps = (await inq.input({
    message: "Do you want to start apps? (y/n):",
    default: "n"
  })) === "y"

  const answer = await inq.checkbox({
    message: "Select apps to initialize:",
    choices: dirs.map((d) => ({ name: routes ? path[os].basename(d) : d, value: d }))
  })

  function removeCommand(fileOrDir) {
    const recursive  = !fileOrDir.includes(".")
    const command = os ==='posix' ? "rm {{flag}} {{file}}" : "if(Test-Path({{file}})){Remove-item {{file}}}{{flag}}"
    const flag = os==='posix' ? "-rf":"-Recurse"
  return command.replace("{{file}}",fileOrDir).replace("{{flag}}",recursive?flag:"")
  }
  

  function getCommand(service) {
    let cmd = `cd ${service}`
    if (pull_repos) cmd += " && git pull"
    if (install_dependencies) cmd += ` && ${removeCommand("node_modules")} && ${removeCommand("package-lock.json")} &&  npm i`
    if (start_apps) cmd += " && npm run dev"
    return cmd
  }

  function isServiceInLine(service, line) {
    return getKey(line) === service
  }

  function getKey(line) {
    return line.trim().split(":")[0]
  }

  function getPort(index) {
    return 4000 + index
  }

  const services = dirs.map((a, i) => ({
    name: '',
    file_lines: [],
    dir: a,
    runInLocal: answer.includes(a),
    port: answer.includes(a) ? getPort(i) : null,
    runCommand: answer.includes(a) ? getCommand(a) : null,
  }))


  const process_reading = async (s) => {
    const next_config = await fs.readFile(`${s.dir}/next.config.js`)
    const file_lines = next_config.toString().split("\n").map((l, i) => ({ number: i, content: l }))

    let service_name = file_lines.find(l => getKey(l.content) === 'name')?.content.split(":")[1]
    service_name = service_name.trim()
    service_name = service_name.substring(1, service_name.length - 2)

    s.name = service_name
    s.file_lines = [...file_lines]
  }

  const promises = services.map(process_reading)
  Promise.all(promises).then(() => {
    if (start_apps) {

      services.forEach(async (s) => {
        const lines_to_process = s.file_lines
          .filter((l) => services.some((s2) => isServiceInLine(s2.name, l.content)))
          .map(l => {
            const matching_service = services.find(s2 => isServiceInLine(s2.name, l.content))

            return {
              ...l,
              newUrl: matching_service.runInLocal ?
                generateLocalUrl(matching_service.port)
                : generateRemoteUrl(matching_service.dir)
            }
          })

        const new_file_lines = [...s.file_lines.map(l => l.content)]
        lines_to_process.forEach(async (l) => {
          let line_to_write = l.content.split("@")[0].concat("@").concat(l.newUrl).concat("`,")
          new_file_lines[l.number] = line_to_write
        })

        const file_string = new_file_lines.join("\n")
        if (file_string)
          await fs.writeFile(`${s.dir}/next.config.js`, file_string)
      })
    }


    services.forEach((service) => {
      if (!service.runInLocal) return
      let child = spawn(service.runCommand, { cwd: process.cwd(), shell: true, env: { ...process.env, "STARTING_PORT": service.port } })
      child.on("spawn", () => console.log(`[${service.name}]: spawned`))
      child.on('exit', () => console.log(`[${service.name}]: exited`))

      child.stdout.on('data', (data) => {
        console.log(`[${service.name}]: ${data}`);
      });

      child.stderr.on('data', (data) => {
        console.error(`[${service.name}]: ${data}`);
      });

      child.on('close', (code) => {
        console.log(`[${service.name}] exited with code ${code}`);
      });
    })

  })


}
init();
