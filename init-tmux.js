const fs = require("node:fs/promises")
const inq = require("@inquirer/prompts")
const { exec, spawn } = require("node:child_process");


function getVSplit(arr) {
  if (arr.length <= 2) return 0;
  if (arr.length <= 4) return 50;
  return 33;
}
function getHSplit(arr) {
  if (arr.length === 1) return 0;
  if (arr.length <= 4) return 50;
  return 33;
}



async function init() {

  const dirs = (await fs.readdir(".")).filter((s) => !s.includes(".") && s !== "node_modules")
  const session_name = await inq.input({ message: "Enter session name:" })
  const install_dependencies = (await inq.input({
    message: "Do you want to install dependencies? (y/n):",
    default: "n"
  })) === "y"
  const pull_repos = (await inq.input({
    message: "Do you want to pull repos? (y/n):",
    default: "n"
  })) === "y"


  const answer = await inq.checkbox({
    message: "Select apps to start",
    choices: dirs.map((d) => ({ name: d, value: d }))
  })

  const v_split = getVSplit(answer)
  const h_split = getHSplit(answer)

  function getCommand(answer, index) {
    let cmd = `cd ${answer}`
    if (pull_repos) cmd += " && git pull"
    if (install_dependencies) cmd += " && npm i"
    cmd += ` && npm run dev --port ${3000 + index}`
    return cmd
  }

  let file = `session_root ${process.cwd()}\n`
    .concat(`if initialize_session "${session_name}"; then\n`)
    .concat('new_window "apps"\n')
    .concat(`run_cmd ${getCommand(answer[0], 0)}`)
  for (let i = 1; i < answer.length; i++) {
    if (i % 2 === 0) file += `split_v ${v_split}\n`
    else file += `split_h ${h_split}\n`
    file += `run_cmd "${getCommand(answer[i], i)}"\n`

  }
  file = file.concat("fi\nfinalize_and_go_to_session")

  await fs.writeFile(`./${session_name}.session.sh`, file)
  console.log("Session created")
}


init();
