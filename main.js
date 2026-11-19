const connectButton = document.getElementById("connect-button");
const disconnectButton = document.getElementById("disconnect-button");
const disconnectedContainer = document.getElementById("disconnected-container");
const repsContainer = document.getElementById("reps-container");
const popupContainer = document.getElementById("popup-container");
const conButton = document.getElementById("concentric-button");
const eccButton = document.getElementById("eccentric-button");
const upButton = document.getElementById("up-button");
const downButton = document.getElementById("down-button");
const resetButton = document.getElementById("reset-button");

// BLUETOOTH
const deviceName = "ESP32_ENCODER";
const primaryServiceUuid =  '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const receiveCharUuid =     '6e400003-b5a3-f393-e0a9-e50e24dcca9e';
const sendCharUuid =        '6e400002-b5a3-f393-e0a9-e50e24dcca9e';

let device, sendCharacteristic, receiveCharacteristic;

// REPS
let reps = [];
let currentRepIndex = 0;
let viewing = "con"; // "con" | "ecc"
let direction = "up"; // "up" | "down"


// reps.push({con:{rom:80,vmax:1.80,vmp:0.9},ecc:{rom:80,vmax:1.07,vmean:0.8}})
// reps.push({con:{rom:80,vmax:1.80,vmp:0.9},ecc:{rom:80,vmax:1.07,vmean:0.8}})
// reps.push({con:{rom:80,vmax:1.80,vmp:0.9},ecc:{rom:80,vmax:1.07,vmean:0.8}})

const onDisconnected = () => {
    device = null;
    receiveCharacteristic = null;
    sendCharacteristic = null;
    connectButton.style.display = 'initial';
    disconnectedContainer.style.display = 'none';    
}

connectButton.addEventListener("click",async () => {
  device = await navigator.bluetooth.requestDevice({
            filters: [{name: deviceName}],
            optionalServices: [primaryServiceUuid]
        })
  server = await device.gatt.connect();
  const service =
           await server.getPrimaryService(primaryServiceUuid);
  receiveCharacteristic =
           await service.getCharacteristic(receiveCharUuid);
  sendCharacteristic =
           await service.getCharacteristic(sendCharUuid);

    receiveCharacteristic.addEventListener('characteristicvaluechanged', handleCharacteristicChange);
    _startNotifications(receiveCharacteristic);

  
  device.ongattserverdisconnected = onDisconnected;
//   connected.style.display = 'block';
  connectButton.style.display = 'none';
  disconnectedContainer.style.display = 'initial';
});

disconnectButton.addEventListener("click", async ()=>{
    await device.gatt.disconnect();
});

async function _startNotifications(characteristic) {
		return new Promise(async (resolve) => {
			let startNotifications = async () => {
				try {
					await characteristic.startNotifications();
					resolve();
				} catch (error) {
					if (!(error instanceof Error) || error.name != 'NotSupportedError')
						throw error;
					console.log(`Device busy, could not subscribe to characteristic ${characteristic.uuid}. Retrying...`);
					setTimeout(startNotifications, 100);
				}
			};
			await startNotifications();
		});
	}


function handleCharacteristicChange(event){
    const value = new TextDecoder().decode(event.target.value);
    console.log("Characteristic value changed: ", value);
    if(value.startsWith("con-"))
    {
        const {rom, vmax, vmp} = JSON.parse(value.substring(4));
        addConcentricRep({rom,vmax,vmp});
    }
    else if(value.startsWith("ecc-"))
    {
        const {rom, mean_v, vmax} = JSON.parse(value.substring(4));
        addEccentricRep({rom,vmean:mean_v,vmax});
    }
    else if(value.startsWith("msg-"))
    {
        addPopup(value.substring(4));
    }

}

async function sendBluetooth(text)
{
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    await sendCharacteristic.writeValueWithResponse(data);
}


// REP FUNCTIONS

function updateReps()
{
    let content =
    `<div class="col-12">
        <div class="row p-2 fs-5 fw-bold dark-background text-white">
            <div class="col-3 col-m-2">Count</div>
            <div class="col-3">ROM (mm)</div>
            <div class="col-3">${viewing === "con" ? "VMP" : viewing === "ecc" ? "Vmean" : ""} (m/s)</div>
            <div class="col-3">Vmax (m/s)</div>
        </div>
    </div>  `;


    if(reps.length === 0)
    {
        content += `<div class="col-12"><p class="m-100 text-center m-4">No Reps recorded yet</p></div>`
    }
    for (let i = 0; i < reps.length; i++) {
        const rep = reps[i];
        content +=
        `<div class="col-12 ${i===reps.length-1 ? "fw-bold" : ""}" style="background-color:${i===reps.length-1 ? "#8cc9c1" : i%2==0 ? "none" : "#cbefea"};">  
            <div class="row m-0 p-2 w-100">
                <div class="col-3 col-m-2">${i+1}</div>
                ${
                    viewing === "con" ?
                    `<div class="col-3">${rep.con.rom}</div>
                    <div class="col-3">${rep.con.vmp}</div>
                    <div class="col-3">${rep.con.vmax}</div>`
                    : viewing === "ecc" &&
                    `<div class="col-3">${rep.ecc.rom}</div>
                    <div class="col-3">${rep.ecc.vmean}</div>
                    <div class="col-3">${rep.ecc.vmax}</div>`
                }
            </div>
        </div>`;
    }
    
    repsContainer.innerHTML = content;
}

function addConcentricRep({rom=0, vmax=0, vmp=0})
{
    reps.push({con:{rom,vmax,vmp},ecc:{rom:"--",vmax:"--",vmean:"--"}});
    
    updateReps();
}

function addEccentricRep({rom=0, vmax=0, vmean=0})
{
    reps[currentRepIndex].ecc = {rom,vmax,vmean};
    currentRepIndex++;
    updateReps();
}

function setViewing(newViewing)
{
    viewing = newViewing;
    updateReps();
}

conButton.addEventListener("click",()=>{
    setViewing("con");
    eccButton.classList.replace("dark-background","btn-transparent");
    conButton.classList.replace("btn-transparent","dark-background");
});
eccButton.addEventListener("click",()=>{
    setViewing("ecc");
    conButton.classList.replace("dark-background","btn-transparent");
    eccButton.classList.replace("btn-transparent","dark-background"); 
});


async function sendDirection(newDir)
{
    direction = newDir;
    if(direction == "up") await sendBluetooth("cmd-up");
    else if(direction == "down") await sendBluetooth("cmd-down");
}

upButton.addEventListener("click",async ()=>{
   
    await sendDirection("up");
    upButton.classList.add("active");
    downButton.classList.remove("active");
});
downButton.addEventListener("click",async ()=>{
    
    await sendDirection("down");
    upButton.classList.remove("active");
    downButton.classList.add("active");
});

resetButton.addEventListener("click",async ()=>{

    reps = [];
    currentRepIndex = 0;
    setViewing("con");

    await sendBluetooth("cmd-reset");

});



// RESPONSE POP UPS

function createElementFromHTML(htmlString) {
  const template = document.createElement('template');
  template.innerHTML = htmlString.trim();
  
  return template.content.firstElementChild;
}

function addPopup(text)
{
    const popupElement = createElementFromHTML(`<div class="popup">✅ ${text}</div>`);
    popupContainer.appendChild(popupElement);

    setTimeout(() => {
        popupElement.remove();
    }, 5000);
}


updateReps();