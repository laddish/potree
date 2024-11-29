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

		// 设置球体的可见性为false
		// this.sphere.visible = false;
		// 假设已经有了当前天空盒纹理和新的天空盒纹理





		// 加载图像
		this.load(image360).then(() => {

			// 加载完成后执行渐变效果
			// 实际效果总是会黑屏一次 怎么解决？

			if (currentSkyboxTexture) {
				this.sphere.visible = true;

				let newSkyboxTexture = image360.texture;

				this.fadeToNewSkybox(currentSkyboxTexture, newSkyboxTexture, 1000);
			} else {
				this.sphere.visible = true;
				this.sphere.material.map = image360.texture;
				currentSkyboxTexture = image360.texture;
				this.sphere.material.needsUpdate = true;
			}
		});



		{ // orientation
			// 获取方向
			let { course, pitch, roll } = image360;
			// 设置球体的旋转
			this.sphere.rotation.set(
				THREE.Math.degToRad(+roll + 90),
				THREE.Math.degToRad(-pitch),
				THREE.Math.degToRad(-course + 90),
				"ZYX"
			);
		}

		// 设置球体的位置
		this.sphere.position.set(...image360.position);

		// 设置目标位置
		let target = new THREE.Vector3(...image360.position);
		// 设置方向
		let dir = target.clone().sub(viewer.scene.view.position).normalize();
		// 设置移动
		let move = dir.multiplyScalar(0.000001);
		// 设置新的相机位置
		let newCamPos = target.clone().sub(move);

		viewer.scene.view.setView(
			newCamPos,
			target,
			500
		);

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
			let texture = new THREE.TextureLoader().load(image360.file, resolve);
			// 设置纹理的重复方式
			texture.wrapS = THREE.RepeatWrapping;
			// 设置纹理的重复次数
			texture.repeat.x = -1;
			image360.texture = texture;
		});
	}

	// 渐变切换天空盒纹理的函数 现在的逻辑不正确 需要重写这个函数 实现渐变效果
	fadeToNewSkybox(currentTexture, newTexture, duration = 1000) {
		// 创建新材质
		let materialNew = new THREE.MeshBasicMaterial({
			map: newTexture,
			side: THREE.BackSide,
			transparent: true,
			opacity: 0
		});

		// 获取当前材质
		let materialOld = this.sphere.material;

		// 确保当前材质支持透明
		materialOld.transparent = true;
		materialOld.opacity = 1;

		// 动画开始时间
		let startTime = performance.now();

		// 动画循环
		const animateFade = () => {
			let elapsedTime = (performance.now() - startTime) / duration;

			if (elapsedTime < 1) {
				// 更新材质透明度
				materialOld.opacity = 1 - elapsedTime;
				materialNew.opacity = elapsedTime;

				// 递归调用，持续动画
				requestAnimationFrame(animateFade);
			} else {
				// 动画结束，确保新材质完全可见
				materialNew.opacity = 1;
				this.sphere.material = materialNew;
			}
		};

		// 启动渐变动画
		animateFade();
		currentSkyboxTexture = newTexture;
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


