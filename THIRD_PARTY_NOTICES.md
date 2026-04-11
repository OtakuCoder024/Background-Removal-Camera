# Third-party notices

## AKVirtualCamera (bundled Windows installer)

This project may bundle **AKVirtualCamera** installer binaries from:

- **Project:** [webcamoid/akvirtualcamera](https://github.com/webcamoid/akvirtualcamera)
- **Version pinned in build:** see `build/akvcam/VERSION.txt`
- **License:** [GNU General Public License v3.0](https://www.gnu.org/licenses/gpl-3.0.html)

The bundled file `akvirtualcamera-windows-*.exe` is the upstream installer. Installing it places `AkVCamManager.exe` and the virtual camera driver under the user’s machine. **Source code** for that version is available at:

`https://github.com/webcamoid/akvirtualcamera/tree/<version>`

(replace `<version>` with the tag listed in `build/akvcam/VERSION.txt`).

This application (Background Removal Camera) is **MIT-licensed** and is a separate work from AKVirtualCamera; bundling the installer does not place your application’s source under the GPL, but you must **retain** the upstream copyright notices and license text shipped under `build/akvcam/` and comply with GPL requirements for **distribution of the GPL-covered binaries** (e.g. offer of corresponding source for those binaries).

## Electron, TensorFlow.js, MediaPipe

See each dependency’s license in `node_modules` and upstream repositories.
