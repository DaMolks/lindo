import {
  DofusWindow,
  GUIEvents,
  GUIWindow,
  GenericWindow
} from '@/dofus-window'
import { TranslationFunctions } from '@lindo/i18n'
import { RootStore } from '@/store'
import { Mod } from '../mod'
import { EventManager } from '../helpers'

// Interface pour les données d'un item du marché
export interface MarketItemData {
  itemId: number;       // ID unique de l'objet
  objectUID: number;    // UID unique de l'objet (peut être différent de itemId)
  name: string;         // Nom de l'objet
  price: number;        // Prix actuel
  quantity: number;     // Quantité disponible
  server: string;       // Serveur de jeu
  timestamp: number;    // Date de la collecte
  minPrice?: number;    // Prix minimum observé (historique)
  maxPrice?: number;    // Prix maximum observé (historique)
  avgPrice?: number;    // Prix moyen (historique)
}

// Interface DB pour stocker les données
interface MarketDBData {
  items: Record<number, MarketItemData>;
  lastUpdate: number;
}

/**
 * Module pour collecter les données des prix du marché dans Dofus Touch
 * pour les utiliser dans l'application Touch Planner
 */
export class MarketDataCollectorMod extends Mod {
  private marketData: Record<number, MarketItemData> = {};
  private eventManager = new EventManager();
  private bidHouseWindow?: GenericWindow;
  private currentServer: string = '';
  private exportButton?: HTMLButtonElement;

  constructor(wGame: DofusWindow, rootStore: RootStore, LL: TranslationFunctions) {
    super(wGame, rootStore, LL);
    
    // Obtenir le nom du serveur
    this.currentServer = this.getServerName();
    
    // Charger les données existantes
    this.loadStoredData();
    
    // Écouter l'ouverture de la fenêtre HDV
    this.setupEventListeners();
    
    // Ajouter un bouton d'exportation dans l'interface
    this.addExportButton();
    
    console.log('[TouchPlanner] Module de collecte des données du marché initialisé');
  }

  /**
   * Obtient le nom du serveur actuel
   */
  private getServerName(): string {
    try {
      // Tentative de récupération du nom du serveur depuis l'interface
      if (this.wGame.gui && this.wGame.gui.playerData) {
        // Accéder au nom du serveur via d'autres propriétés disponibles
        // Cela peut varier selon la structure exacte de l'objet playerData
        return this.wGame.gui.playerData.characterBaseInformations?.name || 'Unknown';
      }
    } catch (e) {
      console.error('[TouchPlanner] Erreur lors de la récupération du nom du serveur:', e);
    }
    return 'Unknown';
  }

  /**
   * Charge les données stockées précédemment
   */
  private loadStoredData() {
    try {
      const storageKey = `touch-planner-market-data-${this.currentServer}`;
      const storedData = localStorage.getItem(storageKey);
      
      if (storedData) {
        const parsedData = JSON.parse(storedData) as MarketDBData;
        this.marketData = parsedData.items || {};
        
        // Nettoyer les données trop anciennes (plus de 7 jours)
        const now = Date.now();
        const oneWeek = 7 * 24 * 60 * 60 * 1000;
        
        for (const itemId in this.marketData) {
          if (now - this.marketData[itemId].timestamp > oneWeek) {
            delete this.marketData[itemId];
          }
        }
        
        console.log(`[TouchPlanner] Données chargées: ${Object.keys(this.marketData).length} items`);
      }
    } catch (e) {
      console.error('[TouchPlanner] Erreur lors du chargement des données stockées:', e);
      this.marketData = {};
    }
  }

  /**
   * Sauvegarde les données collectées
   */
  private saveData() {
    try {
      const storageKey = `touch-planner-market-data-${this.currentServer}`;
      const dataToStore: MarketDBData = {
        items: this.marketData,
        lastUpdate: Date.now()
      };
      
      localStorage.setItem(storageKey, JSON.stringify(dataToStore));
      console.log(`[TouchPlanner] Données sauvegardées: ${Object.keys(this.marketData).length} items`);
    } catch (e) {
      console.error('[TouchPlanner] Erreur lors de la sauvegarde des données:', e);
    }
  }

  /**
   * Configure les écouteurs d'événements
   */
  private setupEventListeners() {
    // Écouter l'ouverture de la fenêtre HDV via un observateur DOM
    this.observeForWindowChanges();

    // Sauvegarder les données périodiquement
    setInterval(() => this.saveData(), 5 * 60 * 1000); // Toutes les 5 minutes
  }

  /**
   * Observer les changements dans le DOM pour détecter l'ouverture des fenêtres
   */
  private observeForWindowChanges() {
    try {
      // Observer les changements dans le DOM pour détecter l'ouverture de nouvelles fenêtres
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            // Parcourir les nœuds ajoutés pour trouver des fenêtres
            mutation.addedNodes.forEach((node) => {
              if (node instanceof HTMLElement) {
                // Vérifier si c'est une fenêtre de l'HDV
                if (
                  node.classList.contains('window') && 
                  (node.id === 'bidHouseShop' || node.querySelector('.bidHouseShop'))
                ) {
                  console.log('[TouchPlanner] Fenêtre du marché détectée');
                  this.hookMarketData(node);
                }
              }
            });
          }
        });
      });

      // Observer le conteneur principal
      const targetNode = document.querySelector('.app') || document.body;
      if (targetNode) {
        observer.observe(targetNode, { 
          childList: true,
          subtree: true
        });
      }
    } catch (e) {
      console.error('[TouchPlanner] Erreur lors de l\'observation des changements de fenêtres:', e);
    }
  }

  /**
   * Accroches sur la fenêtre du marché pour collecter les données
   */
  private hookMarketData(windowElement: HTMLElement) {
    try {
      console.log('[TouchPlanner] Accrochage sur la fenêtre du marché');
      
      // Observer les changements dans le DOM pour détecter les modifications de la fenêtre du marché
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            // Analyser les nœuds ajoutés pour trouver des informations sur les items
            this.analyzeAddedNodes(mutation.addedNodes);
          }
        });
      });

      // Observer les changements dans la fenêtre du marché
      observer.observe(windowElement, {
        childList: true,
        subtree: true
      });
    } catch (e) {
      console.error('[TouchPlanner] Erreur lors de l\'accrochage sur la fenêtre du marché:', e);
    }
  }

  /**
   * Analyse les nœuds ajoutés pour trouver des informations sur les items
   */
  private analyzeAddedNodes(nodes: NodeList) {
    nodes.forEach((node) => {
      if (node instanceof HTMLElement) {
        // Rechercher les éléments qui contiennent des données d'items
        const itemElements = node.querySelectorAll('[data-item-id], .item');
        
        itemElements.forEach((itemElement) => {
          if (itemElement instanceof HTMLElement) {
            this.extractItemDataFromElement(itemElement);
          }
        });
      }
    });
  }

  /**
   * Extrait les données d'un item à partir d'un élément HTML
   */
  private extractItemDataFromElement(element: HTMLElement) {
    try {
      // Tentative d'extraction des données de l'élément
      // Note: Les sélecteurs exacts dépendent de la structure du DOM de Dofus Touch
      
      // Tenter d'obtenir l'ID de l'item
      let itemId = 0;
      const dataItemId = element.getAttribute('data-item-id');
      if (dataItemId) {
        itemId = parseInt(dataItemId);
      } else {
        // Essayer d'autres attributs possibles
        const dataId = element.getAttribute('data-id') || element.getAttribute('id');
        if (dataId && /^\d+$/.test(dataId)) {
          itemId = parseInt(dataId);
        }
      }
      
      if (itemId === 0) return; // Si on n'a pas d'ID valide, on abandonne
      
      // Extraire le nom
      let name = 'Unknown';
      const nameElement = element.querySelector('.name, .title, .itemName');
      if (nameElement && nameElement.textContent) {
        name = nameElement.textContent.trim();
      }
      
      // Extraire le prix
      let price = 0;
      const priceElement = element.querySelector('.price, .kamas, .itemPrice');
      if (priceElement && priceElement.textContent) {
        price = parseInt(priceElement.textContent.replace(/\D/g, '')) || 0;
      }
      
      // Extraire la quantité
      let quantity = 1;
      const quantityElement = element.querySelector('.quantity, .itemQuantity');
      if (quantityElement && quantityElement.textContent) {
        quantity = parseInt(quantityElement.textContent.replace(/\D/g, '')) || 1;
      }
      
      if (itemId && price > 0) {
        console.log(`[TouchPlanner] Item détecté - ID: ${itemId}, Nom: ${name}, Prix: ${price}, Quantité: ${quantity}`);
        
        this.updateItemData(itemId, {
          itemId,
          objectUID: itemId, // Par défaut, utiliser itemId comme objectUID
          name,
          price,
          quantity,
          server: this.currentServer,
          timestamp: Date.now()
        });
      }
    } catch (e) {
      console.error('[TouchPlanner] Erreur lors de l\'extraction des données d\'item:', e);
    }
  }

  /**
   * Met à jour les données d'un item dans notre base de données
   */
  private updateItemData(itemId: number, newData: MarketItemData) {
    const existingData = this.marketData[itemId];
    
    if (!existingData) {
      // Nouvel item, ajouter directement
      this.marketData[itemId] = newData;
      return;
    }
    
    // Mettre à jour les données existantes
    const updatedData: MarketItemData = {
      ...existingData,
      price: newData.price,
      quantity: newData.quantity,
      timestamp: newData.timestamp
    };
    
    // Mettre à jour les statistiques historiques
    if (!updatedData.minPrice || newData.price < updatedData.minPrice) {
      updatedData.minPrice = newData.price;
    }
    
    if (!updatedData.maxPrice || newData.price > updatedData.maxPrice) {
      updatedData.maxPrice = newData.price;
    }
    
    // Calculer la moyenne (simple)
    if (existingData.avgPrice) {
      updatedData.avgPrice = (existingData.avgPrice + newData.price) / 2;
    } else {
      updatedData.avgPrice = newData.price;
    }
    
    this.marketData[itemId] = updatedData;
  }

  /**
   * Ajoute un bouton d'exportation à l'interface du jeu
   */
  private addExportButton() {
    try {
      // Créer le bouton d'exportation
      const button = document.createElement('button');
      button.innerText = 'Exporter prix HDV';
      button.title = 'Exporter les données de prix du marché pour Touch Planner';
      button.style.position = 'absolute';
      button.style.bottom = '10px';
      button.style.right = '10px';
      button.style.zIndex = '9999';
      button.style.padding = '5px 10px';
      button.style.backgroundColor = '#4CAF50';
      button.style.color = 'white';
      button.style.border = 'none';
      button.style.borderRadius = '4px';
      button.style.cursor = 'pointer';
      
      // Ajouter l'événement de clic
      button.addEventListener('click', () => this.exportMarketData());
      
      // Ajouter le bouton au corps du document
      document.body.appendChild(button);
      
      this.exportButton = button;
    } catch (e) {
      console.error('[TouchPlanner] Erreur lors de l\'ajout du bouton d\'exportation:', e);
    }
  }

  /**
   * Exporte les données du marché au format JSON
   */
  private exportMarketData() {
    try {
      // Créer un objet de données à exporter
      const exportData = {
        server: this.currentServer,
        timestamp: Date.now(),
        items: Object.values(this.marketData)
      };
      
      // Convertir en chaîne JSON
      const jsonData = JSON.stringify(exportData, null, 2);
      
      // Créer un blob pour le téléchargement
      const blob = new Blob([jsonData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      // Créer un lien de téléchargement
      const a = document.createElement('a');
      a.href = url;
      a.download = `touch-planner-market-data-${this.currentServer}-${new Date().toISOString().slice(0, 10)}.json`;
      
      // Déclencher le téléchargement
      document.body.appendChild(a);
      a.click();
      
      // Nettoyer
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 0);
      
      console.log(`[TouchPlanner] Données exportées: ${Object.keys(this.marketData).length} items`);
    } catch (e) {
      console.error('[TouchPlanner] Erreur lors de l\'exportation des données:', e);
    }
  }

  /**
   * Nettoie les ressources lors de la destruction du module
   */
  destroy(): void {
    // Sauvegarder les données avant de fermer
    this.saveData();
    
    // Supprimer le bouton d'exportation
    if (this.exportButton && this.exportButton.parentNode) {
      this.exportButton.parentNode.removeChild(this.exportButton);
    }
    
    // Nettoyer les gestionnaires d'événements
    this.eventManager.close();
    
    console.log('[TouchPlanner] Module de collecte des données du marché désactivé');
  }
}
