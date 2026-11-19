"use client";

/**
 * 3D sports car filling the cover's right column, on the page background. Drag to turn it;
 * it renders only while being dragged (and while easing to a stop), so it costs nothing at rest.
 * Model: Khronos glTF sample asset "Car Concept" (CC BY 4.0), compressed with
 * gltf-transform (meshopt + WebP, 11.8 MB → 1.8 MB). three.js loads only when the
 * frame is on screen, rendering pauses off screen, and reduced motion shows a still.
 */
import { useEffect, useRef, useState } from "react";

const MODEL_URL = "/landing/car.glb";

export function CarModel({ className = "" }: { className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    let started = false;
    let visible = false;
    let cleanup = () => {};

    const start = async () => {
      started = true;
      setState("loading");
      try {
        const THREE = await import("three");
        const [{ GLTFLoader }, { MeshoptDecoder }, { RoomEnvironment }, { OrbitControls }] = await Promise.all([
          import("three/examples/jsm/loaders/GLTFLoader.js"),
          import("three/examples/jsm/libs/meshopt_decoder.module.js"),
          import("three/examples/jsm/environments/RoomEnvironment.js"),
          import("three/examples/jsm/controls/OrbitControls.js"),
        ]);
        if (disposed) return;

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
        renderer.setClearColor(0x000000, 0); // transparent: the car sits on the page itself
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.05;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.domElement.style.display = "block";
        renderer.domElement.style.width = "100%";
        renderer.domElement.style.height = "100%";
        el.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        const pmrem = new THREE.PMREMGenerator(renderer);
        const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        scene.environment = envTex;

        const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);

        const sun = new THREE.DirectionalLight("#ffffff", 1.6);
        sun.position.set(0.4, 10, 0.6); // overhead, so the contact shadow sits under the wheels
        sun.castShadow = true;
        sun.shadow.mapSize.set(1024, 1024);
        sun.shadow.radius = 6;
        sun.shadow.camera.left = -4;
        sun.shadow.camera.right = 4;
        sun.shadow.camera.top = 4;
        sun.shadow.camera.bottom = -4;
        scene.add(sun);

        const ground = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.ShadowMaterial({ opacity: 0.24 }));
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        scene.add(ground);

        const loader = new GLTFLoader();
        loader.setMeshoptDecoder(MeshoptDecoder);
        const gltf = await loader.loadAsync(MODEL_URL);
        if (disposed) return;

        const car = gltf.scene;
        car.traverse((o) => {
          const m = o as import("three").Mesh;
          if (m.isMesh) {
            m.castShadow = true;
            m.receiveShadow = true;
            // Transmission needs something behind it; on a transparent canvas the glass would vanish.
            for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
              const pm = mat as import("three").MeshPhysicalMaterial;
              if (pm.transmission > 0) {
                pm.transmission = 0;
                pm.transparent = true;
                pm.opacity = 0.55;
                pm.color.set("#1b1f24");
                pm.roughness = 0.05;
                pm.metalness = 0.2;
                pm.depthWrite = false;
                m.castShadow = false;
              }
            }
          }
        });
        // Normalise: centre on the turntable, wheels on the ground, ~4 units long.
        // precise: the compressed (quantised) geometry makes the quick estimate wrong
        const box = new THREE.Box3().setFromObject(car, true);
        const size = box.getSize(new THREE.Vector3());
        const scale = 4 / Math.max(size.x, size.z);
        car.scale.setScalar(scale);
        box.setFromObject(car, true);
        const centre = box.getCenter(new THREE.Vector3());
        car.position.set(-centre.x, -box.min.y, -centre.z);
        const turntable = new THREE.Group();
        turntable.add(car);
        turntable.rotation.y = -0.65;
        scene.add(turntable);

        const height = box.max.y - box.min.y;
        camera.position.set(3.7, 1.45, 3.7);
        const target = new THREE.Vector3(0, height * 0.32, 0);
        camera.lookAt(target);

        let raf = 0;
        let last = performance.now();
        // eslint-disable-next-line prefer-const
        let loop: (t: number) => void;
        const kick = () => {
          if (!raf) {
            last = performance.now();
            raf = requestAnimationFrame(loop);
          }
        };

        // Drag to turn the car. No zoom or pan, so the wheel still scrolls the page.
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.target.copy(target);
        controls.enableZoom = false;
        controls.enablePan = false;
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.rotateSpeed = 0.7;
        controls.minPolarAngle = Math.PI * 0.2;
        controls.maxPolarAngle = Math.PI * 0.47;
        controls.autoRotate = false; // drag only
        controls.update();
        const onStart = () => {
          el.style.cursor = "grabbing";
          kick();
        };
        const onEnd = () => {
          el.style.cursor = "grab";
        };
        controls.addEventListener("start", onStart);
        controls.addEventListener("end", onEnd);
        controls.addEventListener("change", () => kick());
        el.style.cursor = "grab";

        const resize = () => {
          const w = el.clientWidth, h = el.clientHeight;
          if (!w || !h) return;
          renderer.setSize(w, h, false);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.render(scene, camera);
        };
        resize();
        const ro = new ResizeObserver(resize);
        ro.observe(el);

        loop = (t: number) => {
          const dt = Math.min(0.1, (t - last) / 1000);
          last = t;
          // raf stays non-zero while updating, so the controls' "change" event cannot schedule a second loop
          const moved = controls.update(dt);
          renderer.render(scene, camera);
          raf = 0;
          // keep running only while the car is moving (drag or easing to a stop); otherwise idle
          if (moved && visible && !document.hidden) raf = requestAnimationFrame(loop);
        };
        renderer.render(scene, camera);
        setState("ready");
        kick();
        const onVis = () => !document.hidden && visible && kick();
        document.addEventListener("visibilitychange", onVis);

        cleanup = () => {
          cancelAnimationFrame(raf);
          controls.dispose();
          ro.disconnect();
          document.removeEventListener("visibilitychange", onVis);
          scene.traverse((o) => {
            const m = o as import("three").Mesh;
            if (m.isMesh) {
              m.geometry.dispose();
              (Array.isArray(m.material) ? m.material : [m.material]).forEach((mat) => mat.dispose());
            }
          });
          envTex.dispose();
          pmrem.dispose();
          renderer.dispose();
          renderer.domElement.remove();
        };
        (el as HTMLDivElement & { __kick?: () => void }).__kick = kick;
      } catch {
        if (!disposed) setState("error");
      }
    };

    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !started) start();
      if (visible) (el as HTMLDivElement & { __kick?: () => void }).__kick?.();
    }, { rootMargin: "200px" });
    io.observe(el);

    return () => {
      disposed = true;
      io.disconnect();
      cleanup();
    };
  }, []);

  return (
    <div
      ref={host}
      role="img"
      aria-label="A red electric sports concept car. Drag to turn it."
      className={`relative overflow-hidden ${className}`}
    >
      {state !== "ready" && (
        <p className="absolute inset-0 grid place-items-center text-[12px] text-[var(--ink-soft)]">
          {state === "error" ? "The 3D model could not be displayed." : "Loading 3D model…"}
        </p>
      )}
    </div>
  );
}
