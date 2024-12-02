import * as THREE from "../../../libs/three.js/build/three.module.js";
import { EventDispatcher } from "../../EventDispatcher.js";
import { TextSprite } from "../../TextSprite.js";

// 创建球形网格
let sg = new THREE.SphereGeometry(1, 8, 8);
// 创建高精度球形网格
let sgHigh = new THREE.SphereGeometry(1, 128, 128);
// 创建球形网格材质
let sm = new THREE.MeshBasicMaterial({
  side: THREE.BackSide,
  transparent: true,
  opacity: 1,
  blending: THREE.AdditiveBlending,
  alphaTest: 0.1
});
// 创建高亮球形网格材质
let smHovered = new THREE.MeshBasicMaterial({ side: THREE.BackSide, color: 0xff0000 });
let mixFactor = 0;
let raycaster = new THREE.Raycaster();
let currentlyHovered = null;

let previousView = {
  controls: null,
  position: null,
  target: null,
};

let currentSkyboxTexture = null;
// 在类的开头添加这个过渡着色器材质
const transitionShader = {
  uniforms: {
    tOld: { value: null },
    tNew: { value: null },
    progress: { value: 0.0 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tOld;
    uniform sampler2D tNew;
    uniform float progress;
    varying vec2 vUv;
    
    void main() {
      vec4 texOld = texture2D(tOld, vUv);
      vec4 texNew = texture2D(tNew, vUv);
      gl_FragColor = mix(texOld, texNew, progress);
    }
  `
};

/**
 * 包含一些属性的简单的全景图像对象
 */
class Image360 {

  /**
   * 构造函数
   * @param {string} file 文件路径
   * @param {number} time 时间
   * @param {number} longitude 经度
   * @param {number} latitude 纬度
   * @param {number} altitude 高度
   * @param {number} course 方向
   * @param {number} pitch 俯仰
   * @param {number} roll 翻滚
   */
  constructor(file, time, longitude, latitude, altitude, course, pitch, roll) {
    this.file = file;
    this.time = time;
    this.longitude = longitude;
    this.latitude = latitude;
    this.altitude = altitude;
    this.course = course;
    this.pitch = pitch;
    this.roll = roll;
    this.mesh = null;
  }
};

export class Images360 extends EventDispatcher {

  constructor(viewer) {
    super();

    this.viewer = viewer;

    this.selectingEnabled = true;

    this.images = [];
    this.node = new THREE.Object3D();

    // 创建球形网格
    this.sphere = new THREE.Mesh(sgHigh, sm);
    this.sphere.visible = false;
    this.sphere.scale.set(1000, 1000, 1000);
    this.node.add(this.sphere);
    this._visible = true;
    // this.node.add(label);

    this.focusedImage = null;

    // 创建取消聚焦按钮
    let elUnfocus = document.createElement("input");
    elUnfocus.type = "button";
    elUnfocus.value = "unfocus";
    elUnfocus.style.position = "absolute";
    elUnfocus.style.right = "10px";
    elUnfocus.style.bottom = "10px";
    elUnfocus.style.zIndex = "10000";
    elUnfocus.style.fontSize = "2em";
    elUnfocus.addEventListener("click", () => this.unfocus());
    this.elUnfocus = elUnfocus;

    this.domRoot = viewer.renderer.domElement.parentElement;
    this.domRoot.appendChild(elUnfocus);
    this.elUnfocus.style.display = "none";

    viewer.addEventListener("update", () => {
      this.update(viewer);
    });
    viewer.inputHandler.addInputListener(this);

    this.addEventListener("mousedown", () => {
      if (currentlyHovered && currentlyHovered.image360) {
        this.focus(currentlyHovered.image360);
      }
    });

  };

  set visible(visible) {
    if (this._visible === visible) {
      return;
    }


    for (const image of this.images) {
      image.mesh.visible = visible && (this.focusedImage == null);
    }

    this.sphere.visible = visible && (this.focusedImage != null);
    this._visible = visible;
    this.dispatchEvent({
      type: "visibility_changed",
      images: this,
    });
  }

  get visible() {
    return this._visible;
  }

  /**
   * 聚焦
   * @param {Image360} image360 
   */
  focus(image360) {
    // 保存当前的实际旋转状态
    const currentRotation = this.sphere.rotation.clone();

    // 如果已经聚焦，则取消聚焦
    if (this.focusedImage !== null) {
      this.unfocus();
    }

    // 保存当前视图
    previousView = {
      controls: this.viewer.controls,
      position: this.viewer.scene.view.position.clone(),
      target: this.viewer.scene.view.getPivot(),
    };

    // 设置控制器
    this.viewer.setControls(this.viewer.orbitControls);
    this.viewer.orbitControls.doubleClockZoomEnabled = false;

    // 设置所有全景图像的可见性为false
    for (let image of this.images) {
      image.mesh.visible = false;
    }

    // 设置选择使能为false
    this.selectingEnabled = false;

    // 设置球体可见
    this.sphere.visible = true;

    // 计算目标旋转（默认视角）
    const targetRotation = new THREE.Euler(
      THREE.Math.degToRad(+image360.roll + 90),
      THREE.Math.degToRad(-image360.pitch),
      THREE.Math.degToRad(-image360.course + 90),
      "ZYX"
    );

    // 如果当前有纹理，创建一个新的材质
    if (currentSkyboxTexture) {
      const currentSphereMaterial = new THREE.MeshBasicMaterial({
        map: currentSkyboxTexture,
        side: THREE.BackSide
      });

      this.sphere.material = currentSphereMaterial;
      // 保持当前旋转状态
      this.sphere.rotation.copy(currentRotation);
    } else {
      // 如果是首次加载，使用一个临时的纯色材质和默认旋转
      this.sphere.material = new THREE.MeshBasicMaterial({
        color: 0x808080,
        side: THREE.BackSide
      });
      this.sphere.rotation.copy(targetRotation);
    }

    // 设置球体的位置
    this.sphere.position.set(...image360.position);

    // 设置相机位置
    let target = new THREE.Vector3(...image360.position);
    let dir = target.clone().sub(viewer.scene.view.position).normalize();
    let move = dir.multiplyScalar(0.000001);
    let newCamPos = target.clone().sub(move);

    viewer.scene.view.setView(
      newCamPos,
      target,
      500
    );

    // 加载新纹理
    this.load(image360).then(() => {
      if (!this.focusedImage) return;

      if (currentSkyboxTexture) {
        // 已有纹理，执行渐变
        this.fadeToNewSkybox(currentSkyboxTexture, image360.texture, 1000, targetRotation);
      } else {
        // 首次加载，直接设置新纹理和旋转
        this.sphere.material = new THREE.MeshBasicMaterial({
          map: image360.texture,
          side: THREE.BackSide
        });
        this.sphere.rotation.copy(targetRotation);
        currentSkyboxTexture = image360.texture;
      }
    }).catch(error => {
      console.error('Error loading texture:', error);
      if (currentSkyboxTexture) {
        this.sphere.material = new THREE.MeshBasicMaterial({
          map: currentSkyboxTexture,
          side: THREE.BackSide
        });
      }
    });

    this.focusedImage = image360;
    this.elUnfocus.style.display = "";
  }

  /**
   * 取消聚焦
   */
  unfocus() {
    this.selectingEnabled = true;

    for (let image of this.images) {
      image.mesh.visible = true;
    }

    let image = this.focusedImage;

    if (image === null) {
      return;
    }

    this.sphere.material.map = null;
    this.sphere.material.needsUpdate = true;
    this.sphere.visible = false;

    let pos = viewer.scene.view.position;
    let target = viewer.scene.view.getPivot();
    let dir = target.clone().sub(pos).normalize();
    let move = dir.multiplyScalar(10);
    let newCamPos = target.clone().sub(move);

    viewer.orbitControls.doubleClockZoomEnabled = true;
    viewer.setControls(previousView.controls);

    viewer.scene.view.setView(
      previousView.position,
      previousView.target,
      500
    );

    this.focusedImage = null;

    this.elUnfocus.style.display = "none";
  }

  load(image360) {
    return new Promise(resolve => {
      // TextureLoader 加载纹理
      let texture = new THREE.TextureLoader().load(image360.file, () => {
        // 设置纹理的重复方式
        texture.wrapS = THREE.RepeatWrapping;
        // 设置纹理的重复次数
        texture.repeat.x = -1;
        image360.texture = texture;
        resolve(texture);
      });
    });
  }

  fadeToNewSkybox(oldTexture, newTexture, duration = 1000, targetRotation) {
    if (!oldTexture || !newTexture) return;

    // 确保两个纹理都有正确的包裹和重复设置
    [oldTexture, newTexture].forEach(texture => {
      if (texture) {
        texture.wrapS = THREE.RepeatWrapping;
        texture.repeat.x = -1;
      }
    });

    // 在开始渐变前，先设置到目标旋转
    this.sphere.rotation.copy(targetRotation);

    // 创建过渡材质
    const transitionMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tOld: { value: oldTexture },
        tNew: { value: newTexture },
        progress: { value: 0.0 }
      },
      vertexShader: `
        varying vec2 vUv;
        
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tOld;
        uniform sampler2D tNew;
        uniform float progress;
        varying vec2 vUv;
        
        void main() {
          vec2 uv = vec2(1.0 - vUv.x, vUv.y);
          vec4 texOld = texture2D(tOld, uv);
          vec4 texNew = texture2D(tNew, uv);
          gl_FragColor = mix(texOld, texNew, progress);
        }
      `,
      side: THREE.BackSide,
      transparent: true
    });

    // 保存当前材质
    const previousMaterial = this.sphere.material;

    // 设置过渡材质
    this.sphere.material = transitionMaterial;

    // 动画开始时间
    const startTime = performance.now();
    
    // 动画循环
    const animate = () => {
      if (!this.focusedImage) {
        this.sphere.material = previousMaterial;
        transitionMaterial.dispose();
        return;
      }

      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / duration, 1.0);

      // 更新过渡进度
      transitionMaterial.uniforms.progress.value = progress;

      if (progress >= 1.0) {
        // 渐变完成，设置最终材质
        this.sphere.material = new THREE.MeshBasicMaterial({
          map: newTexture,
          side: THREE.BackSide
        });
        
        currentSkyboxTexture = newTexture;
        
        transitionMaterial.dispose();
        if (previousMaterial && previousMaterial !== this.sphere.material) {
          previousMaterial.dispose();
        }
      } else {
        requestAnimationFrame(animate);
      }
    };

    // 启动动画
    animate();
  }

  handleHovering() {
    let mouse = viewer.inputHandler.mouse;
    let camera = viewer.scene.getActiveCamera();
    let domElement = viewer.renderer.domElement;

    let ray = Potree.Utils.mouseToRay(mouse, camera, domElement.clientWidth, domElement.clientHeight);

    // let tStart = performance.now();
    raycaster.ray.copy(ray);
    let intersections = raycaster.intersectObjects(this.node.children);

    if (intersections.length === 0) {
      // label.visible = false;

      return;
    }

    let intersection = intersections[0];
    currentlyHovered = intersection.object;
    currentlyHovered.material = smHovered;

    //label.visible = true;
    //label.setText(currentlyHovered.image360.file);
    //currentlyHovered.getWorldPosition(label.position);
  }

  update() {

    let { viewer } = this;

    if (currentlyHovered) {
      currentlyHovered.material = sm;
      currentlyHovered = null;
    }

    if (this.selectingEnabled) {
      this.handleHovering();
    }

  }

};

export class Images360Loader {

  /**
   * 加载360度图像
   * @param {string} url 图像的地址
   * @param {Viewer} viewer 
   * @param {Object} params 
   * @returns {Images360}
   */
  static async load(url, viewer, params = {}) {
    // 如果transform不存在，则创建一个
    if (!params.transform) {
      params.transform = {
        forward: a => a,
      };
    }

    // 获取坐标文件
    let response = await fetch(`${url}/coordinates.txt`);
    // 获取坐标文件的文本
    let text = await response.text();

    // 将文本按行分割
    let lines = text.split(/\r?\n/);
    // 获取坐标行
    let coordinateLines = lines.slice(1);

    // 创建全景图像对象
    let images360 = new Images360(viewer);

    // 遍历坐标行
    for (let line of coordinateLines) {
      // 如果行是空，则跳过
      if (line.trim().length === 0) {
        continue;
      }
      // 将行按制表符分割
      let tokens = line.split(/\t/);
      // 获取文件名、时间、经度、纬度、高度、方向、俯仰、翻滚
      let [filename, time, long, lat, alt, course, pitch, roll] = tokens;
      time = parseFloat(time);
      long = parseFloat(long);
      lat = parseFloat(lat);
      alt = parseFloat(alt);
      course = parseFloat(course);
      pitch = parseFloat(pitch);
      roll = parseFloat(roll);

      // 去掉文件名中的双引号
      filename = filename.replace(/"/g, "");
      // 获取文件路径
      let file = `${url}/${filename}`;

      // 创建全景图像对象
      let image360 = new Image360(file, time, long, lat, alt, course, pitch, roll);

      // 将经纬度转换为xy坐标
      let xy = params.transform.forward([long, lat]);
      let position = [...xy, alt];
      image360.position = position;

      // 将全景图像对象添加到全景图像对象数组
      images360.images.push(image360);
    }

    // 创建场景节点
    Images360Loader.createSceneNodes(images360, params.transform);

    return images360;

  }

  /**
   * 创建场景节点
   * @param {Images360} images360 
   * @param {Object} transform 
   */
  static createSceneNodes(images360, transform) {

    for (let image360 of images360.images) {
      let { longitude, latitude, altitude } = image360;
      let xy = transform.forward([longitude, latitude]);

      // 创建球形网格
      let mesh = new THREE.Mesh(sg, sm);
      mesh.position.set(...xy, altitude);
      mesh.scale.set(1, 1, 1);
      mesh.material.transparent = true;
      mesh.material.opacity = 0.75;
      // 将image360赋值给mesh
      mesh.image360 = image360;

      { // 设置方向
        var { course, pitch, roll } = image360;
        mesh.rotation.set(
          THREE.Math.degToRad(+roll + 90),
          THREE.Math.degToRad(-pitch),
          THREE.Math.degToRad(-course + 90),
          "ZYX"
        );
      }

      // 将球形网格添加到场景节点
      images360.node.add(mesh);
      // 将球形网格赋值给image360
      image360.mesh = mesh;
    }
  }
};
