import Store from "electron-store";

const user = new Store({ name: "user-data" });
const devices = new Store({ name: "devices" });
devices.set("list", []);

function isDuplicateDevice(email) {
  const list = devices.get("list") || [];

  return list.some(
    (device) => device.email.toLowerCase() === email.toLowerCase(),
  );
}

function addDevice(newDevice) {
  console.log("device added to network list as well");
  const list = devices.get("list") || [];

  if (isDuplicateDevice(newDevice.email)) {
    console.log("Device with this email already exists");
    return false;
  }

  list.push(newDevice);

  // Sort alphabetically by email
  list.sort((a, b) =>
    a.email.toLowerCase().localeCompare(b.email.toLowerCase()),
  );

  devices.set("list", list);

  return true;
}

function mergeDevices(newDevicesArray) {
  const existingList = devices.get("list") || [];
  const newlyAdded = [];

  newDevicesArray.forEach((newDevice) => {
    const isDuplicate = existingList.some(
      (device) => device.email.toLowerCase() === newDevice.email.toLowerCase(),
    );

    if (!isDuplicate) {
      existingList.push(newDevice);
      newlyAdded.push(newDevice);
    }
  });

  // If nothing added → return null
  if (newlyAdded.length === 0) {
    return null;
  }

  // Sort alphabetically by email
  existingList.sort((a, b) =>
    a.email.toLowerCase().localeCompare(b.email.toLowerCase()),
  );

  devices.set("list", existingList);

  return newlyAdded;
}
export { user, devices, addDevice, isDuplicateDevice, mergeDevices };
