const STORAGE_KEY = "collectionspace-products";
const ADMIN_KEY = "collectionspace-auth";
const ADMIN_PASSWORD = "joniexdoalv16022002";
const FIRESTORE_COLLECTION = "products";

const defaultProducts = [];
let firestoreDb = null;
let catalogUnsubscribe = null;

function getProducts() {
	const raw = localStorage.getItem(STORAGE_KEY);
	if (!raw) {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultProducts));
		return [...defaultProducts];
	}

	try {
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed : [...defaultProducts];
	} catch {
		return [...defaultProducts];
	}
}

function saveProducts(products) {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
}

function hasFirebaseConfig() {
	return typeof window.firebaseConfig === "object" && window.firebaseConfig !== null;
}

function getFirestoreDb() {
	if (firestoreDb) {
		return firestoreDb;
	}

	if (typeof firebase === "undefined" || !hasFirebaseConfig()) {
		return null;
	}

	if (!firebase.apps.length) {
		firebase.initializeApp(window.firebaseConfig);
	}

	firestoreDb = firebase.firestore();
	return firestoreDb;
}

function firebaseReady() {
	return getFirestoreDb() !== null;
}

function readFileAsDataUrl(file) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result);
		reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
		reader.readAsDataURL(file);
	});
}

function getStateClass(estado) {
	if (estado === "Disponible") {
		return "disponible";
	}

	if (estado === "En tratos") {
		return "en-tratos";
	}

	return "vendido";
}

function requireAdmin() {
	return sessionStorage.getItem(ADMIN_KEY) === "yes";
}

function renderCatalog() {
	const contenedor = document.getElementById("productos");
	const buscador = document.getElementById("buscar");

	if (!contenedor || !buscador) {
		return;
	}

	function mostrarProductos(lista) {
		contenedor.innerHTML = "";

		if (lista.length === 0) {
			contenedor.innerHTML = `
				<div class="empty-state">
					<h3>No hay artículos todavía</h3>
					<p>Entra al panel privado para agregar imágenes e información.</p>
				</div>
			`;
			return;
		}

		lista.forEach(producto => {
			contenedor.innerHTML += `
				<div class="card">
					<img src="${producto.imagen}" alt="${producto.nombre}">
					<div class="info">
						<h3>${producto.nombre}</h3>
						<p class="precio">${producto.precio}</p>
						<p>${producto.descripcion || ""}</p>
						<p class="${getStateClass(producto.estado)}">${producto.estado}</p>
					</div>
				</div>
			`;
		});
	}

	const db = getFirestoreDb();
	let products = getProducts();

	function applySearch() {
		const texto = buscador.value.toLowerCase();
		const filtrados = products.filter((producto) => producto.nombre.toLowerCase().includes(texto));
		mostrarProductos(filtrados);
	}

	buscador.addEventListener("keyup", applySearch);

	if (db) {
		if (catalogUnsubscribe) {
			catalogUnsubscribe();
		}

		catalogUnsubscribe = db.collection(FIRESTORE_COLLECTION)
			.orderBy("createdAt", "desc")
			.onSnapshot((snapshot) => {
				products = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
				applySearch();
			});
		return;
	}

	applySearch();
}

function renderLogin() {
	const loginForm = document.getElementById("login-form");

	if (!loginForm) {
		return;
	}

	loginForm.addEventListener("submit", event => {
		event.preventDefault();
		const password = loginForm.password.value.trim();

		if (password === ADMIN_PASSWORD) {
			sessionStorage.setItem(ADMIN_KEY, "yes");
			window.location.href = "admin.html";
			return;
		}

		alert("Clave incorrecta.");
	});
}

function renderAdmin() {
	const adminForm = document.getElementById("admin-form");
	const adminLista = document.getElementById("admin-productos");

	if (!adminForm || !adminLista) {
		return;
	}

	if (!requireAdmin()) {
		window.location.href = "login.html";
		return;
	}

	const db = getFirestoreDb();
	let currentProducts = getProducts();

	function renderList() {
		const products = currentProducts;

		if (products.length === 0) {
			adminLista.innerHTML = `
				<div class="empty-state">
					<h3>No hay artículos guardados</h3>
					<p>Agrega tu primer artículo usando el formulario.</p>
				</div>
			`;
			return;
		}

		adminLista.innerHTML = products.map((product, index) => `
			<article class="admin-item">
				<img src="${product.imagen}" alt="${product.nombre}">
				<div>
					<h3>${product.nombre}</h3>
					<p>${product.precio}</p>
					<p class="${getStateClass(product.estado)}">${product.estado}</p>
					<p>${product.descripcion || ""}</p>
				</div>
				<button class="button secondary" type="button" data-delete="${index}">Borrar</button>
			</article>
		`).join("");

		adminLista.querySelectorAll("[data-delete]").forEach(button => {
			button.addEventListener("click", () => {
				const index = Number(button.getAttribute("data-delete"));
				const product = products[index];

				if (db && product && product.id) {
					db.collection(FIRESTORE_COLLECTION).doc(product.id).delete();
					return;
				}

				const nextProducts = getProducts();
				nextProducts.splice(index, 1);
				saveProducts(nextProducts);
				currentProducts = nextProducts;
				renderList();
			});
		});
	}

	adminForm.addEventListener("submit", async event => {
		event.preventDefault();

		const formData = new FormData(adminForm);
		const imageFile = adminForm.imagen.files[0];

		if (!imageFile) {
			alert("Selecciona una imagen.");
			return;
		}

		let imageDataUrl;
		try {
			imageDataUrl = await readFileAsDataUrl(imageFile);
		} catch (error) {
			alert("No se pudo cargar la imagen.");
			return;
		}

		const newProduct = {
			nombre: formData.get("nombre").trim(),
			precio: formData.get("precio").trim(),
			estado: formData.get("estado").trim(),
			imagen: imageDataUrl,
			descripcion: formData.get("descripcion").trim(),
			createdAt: Date.now(),
		};

		if (db) {
			await db.collection(FIRESTORE_COLLECTION).add({
				...newProduct,
				createdAt: firebase.firestore.FieldValue.serverTimestamp(),
			});
		} else {
			const products = getProducts();
			products.unshift({ ...newProduct, id: String(Date.now()) });
			saveProducts(products);
			currentProducts = products;
			renderList();
		}

		adminForm.reset();
	});

	if (db) {
		db.collection(FIRESTORE_COLLECTION)
			.orderBy("createdAt", "desc")
			.onSnapshot((snapshot) => {
				currentProducts = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
				renderList();
			});
		return;
	}

	renderList();
}

renderCatalog();
renderLogin();
renderAdmin();
