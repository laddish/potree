

import * as THREE from "../libs/three.js/build/three.module.js";
import {Action} from "./Actions.js";
import {Utils} from "./utils.js";
import {EventDispatcher} from "./EventDispatcher.js";

/**
 * args 参数:
 * position 位置
 * title 标题
 * description 描述
 * cameraPosition 相机位置
 * cameraTarget 相机目标
 * radius 半径
 * view 视图
 * keepOpen 保持打开
 * descriptionVisible 描述可见
 * showDescription 显示描述
 * actions 动作
 * isHighlighted 是否突出显示
 * _visible 是否可见
 * __visible 是否可见
 * _display 是否显示
 * _expand 是否展开
 * collapseThreshold 折叠阈值
 * children 子注释
 * parent 父注释
 * boundingBox 边界框
 * domElement 元素
 * elTitlebar 标题栏
 * elTitle 标题
 * elDescription 描述
 * elDescriptionClose 描述关闭
 * clickTitle 点击标题
 * actions 动作
 * installHandles 安装句柄
 * removeHandles 移除句柄
 * get visible 获取可见
 * set visible 设置可见
 * get display 获取显示
 * set display 设置显示
 * get title 获取标题
 * set title 设置标题
 * get description 获取描述
 * set description 设置描述
 * add 添加注释
 * level 级别
 * hasChild 是否有子注释
 * remove 移除注释
 * removeAllChildren 移除所有子注释
 * updateBounds 更新边界框
 * traverse 遍历
 * traverseDescendants 遍历子注释
 * flatten 扁平化
 * descendants 子注释
 * dispose 释放
 * toString 字符串表示
 * setHighlighted 设置突出显示
 * hasView 是否有视图
 * moveHere 移动到指定位置
 * dispose 释放
 * toString 字符串表示
 */
export class Annotation extends EventDispatcher {
	constructor (args = {}) {
		super();

		this.scene = null;
		// 标题栏	
		this._title = args.title || 'No Title';
		// 描述
		this._description = args.description || '';
		// 偏移量
		this.offset = new THREE.Vector3();
		// 唯一标识
		this.uuid = THREE.Math.generateUUID();
		// 位置
		if (!args.position) {
			this.position = null;
		} else if (args.position.x != null) {
			this.position = args.position;
		} else {
			this.position = new THREE.Vector3(...args.position);
		}
		// 相机位置
		this.cameraPosition = (args.cameraPosition instanceof Array)
			? new THREE.Vector3().fromArray(args.cameraPosition) : args.cameraPosition;
		// 相机目标
		this.cameraTarget = (args.cameraTarget instanceof Array)
			? new THREE.Vector3().fromArray(args.cameraTarget) : args.cameraTarget;
		// 半径
		this.radius = args.radius;
		// 视图
		this.view = args.view || null;
		// 保持打开
		this.keepOpen = false;
		// 描述可见
		this.descriptionVisible = false;
		// 显示描述
		this.showDescription = true;
		// 动作
		this.actions = args.actions || [];
		// 是否突出显示
		this.isHighlighted = false;
		// 是否可见
		this._visible = true;
		// 是否可见
		this.__visible = true;
		// 是否显示
		this._display = true;
		// 是否展开
		this._expand = false;
		// 折叠阈值
		this.collapseThreshold = [args.collapseThreshold, 100].find(e => e !== undefined);
		// 子注释
		this.children = [];
		// 父注释
		this.parent = null;
		// 边界框
		this.boundingBox = new THREE.Box3();
		// 关闭图标
		let iconClose = exports.resourcePath + '/icons/close.svg';
		// 注释元素
		this.domElement = $(`
			<div class="annotation" oncontextmenu="return false;">
				<div class="annotation-titlebar">
					<span class="annotation-label"></span>
				</div>
				<div class="annotation-description">
					<span class="annotation-description-close">
						<img src="${iconClose}" width="16px">
					</span>
					<span class="annotation-description-content">${this._description}</span>
				</div>
			</div>
		`);

		// 标题栏
		this.elTitlebar = this.domElement.find('.annotation-titlebar');
		// 标题
		this.elTitle = this.elTitlebar.find('.annotation-label');
		this.elTitle.append(this._title);
		// 描述
		this.elDescription = this.domElement.find('.annotation-description');
		// 描述关闭
		this.elDescriptionClose = this.elDescription.find('.annotation-description-close');
		// this.elDescriptionContent = this.elDescription.find(".annotation-description-content");
		// 点击标题
		this.clickTitle = () => {
			if(this.hasView()){
				this.moveHere(this.scene.getActiveCamera());
			}
			this.dispatchEvent({type: 'click', target: this});
		};
		// 点击标题
		this.elTitle.click(this.clickTitle);
		// 动作
		this.actions = this.actions.map(a => {
			if (a instanceof Action) {
				return a;
			} else {
				return new Action(a);
			}
		});
		// 配对动作
		for (let action of this.actions) {
			action.pairWith(this);
		}
		// 过滤动作
		let actions = this.actions.filter(
			a => a.showIn === undefined || a.showIn.includes('scene'));
		// 添加动作图标
		for (let action of actions) {
			let elButton = $(`<img src="${action.icon}" class="annotation-action-icon">`);
			this.elTitlebar.append(elButton);
			elButton.click(() => action.onclick({annotation: this}));
		}
		// 描述关闭悬停
		this.elDescriptionClose.hover(
			e => this.elDescriptionClose.css('opacity', '1'),
			e => this.elDescriptionClose.css('opacity', '0.5')
		);
		// 描述关闭点击
		this.elDescriptionClose.click(e => this.setHighlighted(false));
		// this.elDescriptionContent.html(this._description);

		// 鼠标进入事件
		this.domElement.mouseenter(e => this.setHighlighted(true));
		// 鼠标离开事件
		this.domElement.mouseleave(e => this.setHighlighted(false));

		// 触摸事件
		this.domElement.on('touchstart', e => {
			this.setHighlighted(!this.isHighlighted);
		});

		this.display = false;
		//this.display = true;

	}

	/**
	 * 安装句柄
	 * @param {Viewer} viewer 
	 */
	installHandles(viewer){
		if(this.handles !== undefined){
			return;
		}

		let domElement = $(`
			<div style="position: absolute; left: 300; top: 200; pointer-events: none">
				<svg width="300" height="600">
					<line x1="0" y1="0" x2="1200" y2="200" style="stroke: black; stroke-width:2" />
					<circle cx="50" cy="50" r="4" stroke="black" stroke-width="2" fill="gray" />
					<circle cx="150" cy="50" r="4" stroke="black" stroke-width="2" fill="gray" />
				</svg>
			</div>
		`);
		// svg
		let svg = domElement.find("svg")[0];
		// 线
		let elLine = domElement.find("line")[0];
		// 开始圆
		let elStart = domElement.find("circle")[0];
		// 结束圆
		let elEnd = domElement.find("circle")[1];
		// 设置坐标
		let setCoordinates = (start, end) => {
			elStart.setAttribute("cx", `${start.x}`);
			elStart.setAttribute("cy", `${start.y}`);

			elEnd.setAttribute("cx", `${end.x}`);
			elEnd.setAttribute("cy", `${end.y}`);

			elLine.setAttribute("x1", start.x);
			elLine.setAttribute("y1", start.y);
			elLine.setAttribute("x2", end.x);
			elLine.setAttribute("y2", end.y);

			let box = svg.getBBox();
			svg.setAttribute("width", `${box.width}`);
			svg.setAttribute("height", `${box.height}`);
			svg.setAttribute("viewBox", `${box.x} ${box.y} ${box.width} ${box.height}`);

			let ya = start.y - end.y;
			let xa = start.x - end.x;

			if(ya > 0){
				start.y = start.y - ya;
			}
			if(xa > 0){
				start.x = start.x - xa;
			}

			domElement.css("left", `${start.x}px`);
			domElement.css("top", `${start.y}px`);

		};
		// 渲染区域
		$(viewer.renderArea).append(domElement);


		let annotationStartPos = this.position.clone();
		let annotationStartOffset = this.offset.clone();

		// 拖拽开始
		$(this.domElement).draggable({
			start: (event, ui) => {
				annotationStartPos = this.position.clone();
				annotationStartOffset = this.offset.clone();
				$(this.domElement).find(".annotation-titlebar").css("pointer-events", "none");

				console.log($(this.domElement).find(".annotation-titlebar"));
			},
			stop: () => {
				$(this.domElement).find(".annotation-titlebar").css("pointer-events", "");
			},
			drag: (event, ui ) => {
				let renderAreaWidth = viewer.renderer.getSize(new THREE.Vector2()).width;
				//let renderAreaHeight = viewer.renderer.getSize().height;

				let diff = {
					x: ui.originalPosition.left - ui.position.left, 
					y: ui.originalPosition.top - ui.position.top
				};

				let nDiff = {
					x: -(diff.x / renderAreaWidth) * 2,
					y: (diff.y / renderAreaWidth) * 2
				};

				let camera = viewer.scene.getActiveCamera();
				let oldScreenPos = new THREE.Vector3()
					.addVectors(annotationStartPos, annotationStartOffset)
					.project(camera);

				let newScreenPos = oldScreenPos.clone();
				newScreenPos.x += nDiff.x;
				newScreenPos.y += nDiff.y;

				let newPos = newScreenPos.clone();
				newPos.unproject(camera);

				let newOffset = new THREE.Vector3().subVectors(newPos, this.position);
				this.offset.copy(newOffset);
			}
		});
		// 更新回调
		let updateCallback = () => {
			let position = this.position;
			let scene = viewer.scene;

			const renderAreaSize = viewer.renderer.getSize(new THREE.Vector2());
			let renderAreaWidth = renderAreaSize.width;
			let renderAreaHeight = renderAreaSize.height;

			let start = this.position.clone();
			let end = new THREE.Vector3().addVectors(this.position, this.offset);

			let toScreen = (position) => {
				let camera = scene.getActiveCamera();
				let screenPos = new THREE.Vector3();

				let worldView = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
				let ndc = new THREE.Vector4(position.x, position.y, position.z, 1.0).applyMatrix4(worldView);
				// limit w to small positive value, in case position is behind the camera
				ndc.w = Math.max(ndc.w, 0.1);
				ndc.divideScalar(ndc.w);

				screenPos.copy(ndc);
				screenPos.x = renderAreaWidth * (screenPos.x + 1) / 2;
				screenPos.y = renderAreaHeight * (1 - (screenPos.y + 1) / 2);

				return screenPos;
			};
			
			start = toScreen(start);
			end = toScreen(end);

			setCoordinates(start, end);

		};

		viewer.addEventListener("update", updateCallback);
		// 句柄
		this.handles = {
			domElement: domElement,
			setCoordinates: setCoordinates,
			updateCallback: updateCallback
		};
	}

	/**
	 * 移除句柄
	 * @param {Viewer} viewer 
	 */
	removeHandles(viewer){
		if(this.handles === undefined){
			return;
		}

		//$(viewer.renderArea).remove(this.handles.domElement);
		this.handles.domElement.remove();
		viewer.removeEventListener("update", this.handles.updateCallback);

		delete this.handles;
	}

	/**
	 * 获取可见
	 * @returns {boolean} 
	 */
	get visible () {
		return this._visible;
	}

	/**
	 * 设置可见
	 * @param {boolean} value 
	 */
	set visible (value) {
		if (this._visible === value) {
			return;
		}

		this._visible = value;

		//this.traverse(node => {
		//	node.display = value;
		//});

		this.dispatchEvent({
			type: 'visibility_changed',
			annotation: this
		});
	}

	get display () {
		return this._display;
	}

	set display (display) {
		if (this._display === display) {
			return;
		}

		this._display = display;

		if (display) {
			// this.domElement.fadeIn(200);
			this.domElement.show();
		} else {
			// this.domElement.fadeOut(200);
			this.domElement.hide();
		}
	}

	get expand () {
		return this._expand;
	}

	set expand (expand) {
		if (this._expand === expand) {
			return;
		}

		if (expand) {
			this.display = false;
		} else {
			this.display = true;
			this.traverseDescendants(node => {
				node.display = false;
			});
		}

		this._expand = expand;
	}

	get title () {
		return this._title;
	}

	set title (title) {
		if (this._title === title) {
			return;
		}

		this._title = title;
		this.elTitle.empty();
		this.elTitle.append(this._title);

		this.dispatchEvent({
			type: "annotation_changed",
			annotation: this,
		});
	}

	get description () {
		return this._description;
	}

	set description (description) {
		if (this._description === description) {
			return;
		}

		this._description = description;

		const elDescriptionContent = this.elDescription.find(".annotation-description-content");
		elDescriptionContent.empty();
		elDescriptionContent.append(this._description);

		this.dispatchEvent({
			type: "annotation_changed",
			annotation: this,
		});
	}

	/**
	 * 添加注释
	 * @param {Annotation} annotation 
	 */
	add (annotation) {
		if (!this.children.includes(annotation)) {
			this.children.push(annotation);
			annotation.parent = this;

			let descendants = [];
			annotation.traverse(a => { descendants.push(a); });

			for (let descendant of descendants) {
				let c = this;
				while (c !== null) {
					c.dispatchEvent({
						'type': 'annotation_added',
						'annotation': descendant
					});
					c = c.parent;
				}
			}
		}
	}

	/**
	 * 级别
	 * @returns {number} 
	 */
	level () {
		if (this.parent === null) {
			return 0;
		} else {
			return this.parent.level() + 1;
		}
	}

	/**
	 * 是否有子注释
	 * @param {Annotation} annotation 
	 * @returns {boolean} 
	 */
	hasChild(annotation) {
		return this.children.includes(annotation);
	}

	/**
	 * 移除注释
	 * @param {Annotation} annotation 
	 */
	remove (annotation) {
		if (this.hasChild(annotation)) {
			annotation.removeAllChildren();
			annotation.dispose();
			this.children = this.children.filter(e => e !== annotation);
			annotation.parent = null;
		}
	}

	/**
	 * 移除所有子注释
	 */
	removeAllChildren() {
		this.children.forEach((child) => {
			if (child.children.length > 0) {
				child.removeAllChildren();
			}

			this.remove(child);
		});
	}

	/**
	 * 更新边界框
	 */
	updateBounds () {
		let box = new THREE.Box3();

		if (this.position) {
			box.expandByPoint(this.position);
		}

		for (let child of this.children) {
			child.updateBounds();

			box.union(child.boundingBox);
		}

		this.boundingBox.copy(box);
	}

	/**
	 * 遍历
	 * @param {function} handler 
	 */
	traverse (handler) {
		let expand = handler(this);

		if (expand === undefined || expand === true) {
			for (let child of this.children) {
				child.traverse(handler);
			}
		}
	}

	/**
	 * 遍历子注释
	 * @param {function} handler 
	 */
	traverseDescendants (handler) {
		for (let child of this.children) {
			child.traverse(handler);
		}
	}

	/**
	 * 扁平化
	 * @returns {Annotation[]} 
	 */
	flatten () {
		let annotations = [];

		this.traverse(annotation => {
			annotations.push(annotation);
		});

		return annotations;
	}

	/**
	 * 后代注释
	 * @returns {Annotation[]} 
	 */
	descendants () {
		let annotations = [];

		this.traverse(annotation => {
			if (annotation !== this) {
				annotations.push(annotation);
			}
		});

		return annotations;
	}

	/**
	 * 设置注释的突出显示状态
	 * @param {boolean} highlighted 
	 */
	setHighlighted (highlighted) {
		if (highlighted) {
			this.domElement.css('opacity', '0.8');
			this.elTitlebar.css('box-shadow', '0 0 5px #fff');
			this.domElement.css('z-index', '1000');

			if (this._description) {
				this.descriptionVisible = true;
				this.elDescription.fadeIn(200);
				this.elDescription.css('position', 'relative');
			}
		} else {
			this.domElement.css('opacity', '0.5');
			this.elTitlebar.css('box-shadow', '');
			this.domElement.css('z-index', '100');
			this.descriptionVisible = false;
			this.elDescription.css('display', 'none');
		}

		this.isHighlighted = highlighted;
	}

	hasView () {
		let hasPosTargetView = this.cameraTarget.x != null;
		hasPosTargetView = hasPosTargetView && this.cameraPosition.x != null;

		let hasRadiusView = this.radius !== undefined;

		let hasView = hasPosTargetView || hasRadiusView;

		return hasView;
	};

	/**
	 * 移动到指定位置
	 * @param {Camera} camera 
	 */
	moveHere (camera) {
		if (!this.hasView()) {
			return;
		}

		let view = this.scene.view;
		let animationDuration = 500;
		let easing = TWEEN.Easing.Quartic.Out;

		let endTarget;
		if (this.cameraTarget) {
			endTarget = this.cameraTarget;
		} else if (this.position) {
			endTarget = this.position;
		} else {
			endTarget = this.boundingBox.getCenter(new THREE.Vector3());
		}

		if (this.cameraPosition) {
			let endPosition = this.cameraPosition;

			Utils.moveTo(this.scene, endPosition, endTarget);
		} else if (this.radius) {
			let direction = view.direction;
			let endPosition = endTarget.clone().add(direction.multiplyScalar(-this.radius));
			let startRadius = view.radius;
			let endRadius = this.radius;

			{ 
				// 动画相机位置
				let tween = new TWEEN.Tween(view.position).to(endPosition, animationDuration);
				tween.easing(easing);
				tween.start();
			}

			{ 
				// 动画半径
				let t = {x: 0};

				let tween = new TWEEN.Tween(t)
					.to({x: 1}, animationDuration)
					.onUpdate(function () {
						view.radius = this.x * endRadius + (1 - this.x) * startRadius;
					});
				tween.easing(easing);
				tween.start();
			}
		}
	};

	/**
	 * 释放
	 */
	dispose () {
		if (this.domElement.parentElement) {
			this.domElement.parentElement.removeChild(this.domElement);
		}
	};

	/**
	 * 字符串表示
	 * @returns {string} 
	 */
	toString () {
		return 'Annotation: ' + this._title;
	}
};
